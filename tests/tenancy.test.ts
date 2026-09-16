import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import pg from 'pg';
import {createTenant,selectTenant,requestTenant,bindAccount} from '../src/lib/tenant-service';
import {materializeRoutes} from '../src/lib/fixed-routes';
import {readTrialRange} from '../src/lib/schedule-trial-data';
import {changeOwnPassword} from '../src/lib/profile-management';
import {hashPassword,verifyPassword} from '../src/lib/password';

test('independent institutions: migration, isolation, membership and scheduling',async t=>{
 const url=process.env.KIDLOOP_TEST_DATABASE_URL;
 assert.ok(url&&['localhost','127.0.0.1'].includes(new URL(url).hostname),'Explicit local database required');
 const pool=new pg.Pool({connectionString:url}),c=await pool.connect();
 const schema='tenancy_'+randomUUID().replaceAll('-','');
 const first='00000000-0000-4000-8000-000000000001';
 const tx=async<T>(fn:()=>Promise<T>)=>{await c.query('begin');try{const r=await fn();await c.query('commit');return r;}catch(e){await c.query('rollback');throw e;}};
 const scoped=async<T>(tenant:string|null,fn:()=>Promise<T>)=>tx(async()=>{
  await c.query('set local role kidloop_runtime');
  await c.query("select set_config('kidloop.tenant_id',$1,true)",[tenant??'']);return fn();
 });
 const id=async(sql:string,args:unknown[]=[])=>String((await c.query(sql+' returning id',args)).rows[0].id);
 try {
  await c.query(`create schema ${schema}`);await c.query(`set search_path to ${schema}`);
  for(const f of(await readdir('db/migrations')).filter(f=>f.endsWith('.sql')&&!f.startsWith('047_')&&f<'054').sort())await c.query(await readFile('db/migrations/'+f,'utf8'));
  const password=await hashPassword('tenant-test-password');
  const legacy=await id("insert into app_users(name,email,role,password_hash) values('Legacy','legacy@example.test','ADMIN',$1)",[password]);
  const legacySchool=await id("insert into schools(name,address) values('Legacy School','Address')");
  const before=(await c.query('select to_jsonb(s) data from schools s where id=$1',[legacySchool])).rows[0].data;
  await c.query("insert into user_sessions(token_hash,user_id,expires_at) values('legacy-session',$1,now()+interval '1 day')",[legacy]);
  await tx(async()=>c.query(await readFile('db/migrations/054_independent_tenants.sql','utf8')));
  let second='';
  await t.test('migration preserves original records, credentials and selected sessions',async()=>{
   const after=(await c.query('select to_jsonb(s) data from schools s where id=$1',[legacySchool])).rows[0].data;
   assert.equal(after.tenant_id,first);delete after.tenant_id;assert.deepEqual(after,before);
   assert.equal((await c.query('select password_hash from login_accounts where id=$1',[legacy])).rows[0].password_hash,password);
   assert.equal((await c.query("select selected_tenant_id from account_sessions where token_hash='legacy-session'")).rows[0].selected_tenant_id,first);
   const counts=(await c.query(`select table_name from tenant_tables where not exists(select 1 from pg_policies p where p.schemaname=current_schema() and p.tablename=table_name and p.policyname='tenant_isolation')`)).rows;
   assert.deepEqual(counts,[]);
  });
  await t.test('creator gets a new empty institution without copied operational data',async()=>{
   second=await tx(()=>createTenant(c,legacy,'Second provider'));
   assert.equal((await scoped(second,()=>c.query('select count(*)::int n from schools'))).rows[0].n,0);
   assert.equal((await scoped(second,()=>c.query('select count(*)::int n from travel_time_profiles'))).rows[0].n,0);
   assert.equal((await scoped(second,()=>c.query('select count(*)::int n from student_status_reasons'))).rows[0].n,5);
   assert.equal((await scoped(second,()=>c.query('select count(*)::int n from app_users'))).rows[0].n,1);
  });
  await t.test('RLS hides all foreign records and rejects foreign writes, missing context and global credentials',async()=>{
   assert.equal((await scoped(second,()=>c.query('select * from schools where id=$1',[legacySchool]))).rowCount,0);
   assert.equal((await scoped(second,()=>c.query("update schools set name='bad' where id=$1",[legacySchool]))).rowCount,0);
   assert.equal((await scoped(null,()=>c.query('select * from schools'))).rowCount,0);
   await assert.rejects(scoped(second,()=>c.query("insert into schools(name,address,tenant_id) values('bad','bad',$1)",[first])),/row-level security/);
   await assert.rejects(scoped(null,()=>c.query("insert into schools(name,address) values('bad','bad')")),/row-level security/);
   await assert.rejects(scoped(second,()=>c.query('select * from login_accounts')),/permission denied/);
   await assert.rejects(scoped(second,()=>c.query('select * from account_sessions')),/permission denied/);
   await assert.rejects(scoped(second,()=>c.query("update app_users set password_hash='bad'")),/permission denied/);
   await assert.rejects(scoped(second,()=>c.query('truncate schools cascade')),/permission denied/);
  });
  await t.test('every registered operational table is tenant-filtered, including photos and execution facts',async()=>{
   const tables=(await c.query('select table_name from tenant_tables')).rows.map(r=>r.table_name as string);
   for(const table of tables){
    assert.match(table,/^[a-z_]+$/);
    const records=await scoped(second,()=>c.query(`select tenant_id from "${table}"`));
    assert.ok(records.rows.every(r=>r.tenant_id===second),table);
    assert.equal((await scoped(null,()=>c.query(`select 1 from "${table}"`))).rowCount,0,table);
   }
   const photo=await scoped(first,()=>id("insert into student_photos(id,uploaded_by,blob_url) values(gen_random_uuid(),$1,'https://example.test/private.jpg')",[legacy]));
   assert.equal((await scoped(second,()=>c.query('select * from student_photos where id=$1',[photo]))).rowCount,0);
  });
  await t.test('composite constraints reject cross-institution foreign keys',async()=>{
   await assert.rejects(scoped(second,()=>c.query("insert into classrooms(school_id,name) values($1,'Foreign')",[legacySchool])),/foreign key/);
  });
  await t.test('each institution has its own term, plate, reason and travel-time configuration',async()=>{
   for(const tenant of [first,second])await scoped(tenant,async()=>{
    await c.query("insert into operating_terms(name,starts_on,ends_on) values('Fall','2026-09-01','2026-09-30')");
    await c.query("insert into vehicles(name,plate,capacity) values('Van','SAME-PLATE',8)");
    await c.query("insert into travel_time_profiles(from_name,to_name,estimated_minutes) values('Same A','Same B',10) on conflict(tenant_id,from_name,to_name) do update set estimated_minutes=excluded.estimated_minutes");
    assert.equal((await c.query('select count(*)::int n from operating_terms where id=current_operating_term()')).rows[0].n,1);
   });
   await assert.rejects(scoped(second,()=>c.query("insert into operating_terms(name,starts_on,ends_on) values('Another','2026-09-01','2026-09-30')")),/unique/);
   await scoped(second,()=>c.query("update student_status_reasons set name_zh='Second only' where id='ILLNESS'"));
   assert.equal((await scoped(first,()=>c.query("select name_zh from student_status_reasons where id='ILLNESS'"))).rows[0].name_zh,'因病缺席');
  });
  await t.test('trial/materialization and caches operate within the selected institution',async()=>{
   for(const tenant of [first,second])await scoped(tenant,async()=>{
    await materializeRoutes(c,'2026-09-15','2026-09-15');
    const r=await readTrialRange(c,['2026-09-15']);assert.equal(r.summaries.length,1);
   });
   assert.equal((await scoped(second,()=>c.query('select count(*)::int n from schedule_preview_cache'))).rows[0].n,1);
   assert.equal((await scoped(first,()=>c.query('select count(*)::int n from schedule_preview_cache'))).rows[0].n,1);
   assert.equal((await c.query('select count(*)::int n from schedule_preview_cache')).rows[0].n,2);
   const view=(await c.query("select reloptions from pg_class where oid='observed_travel_samples'::regclass")).rows[0];
   assert.ok(view.reloptions.includes('security_invoker=true'));
  });
  let applicant='';
  await t.test('requests grant no access until institution approval; forged institution resources rejected',async()=>{
   applicant=await id("insert into login_accounts(name,email,password_hash) values('Applicant','applicant@example.test',$1)",[password]);
   const code=(await c.query('select join_code from tenants where id=$1',[first])).rows[0].join_code;
   await tx(()=>requestTenant(c,applicant,code));await tx(()=>requestTenant(c,applicant,code));
   assert.equal((await c.query('select * from app_users where account_id=$1',[applicant])).rowCount,0);
   const request=(await c.query('select id from tenant_join_requests where account_id=$1',[applicant])).rows[0].id;
   const foreignDriver=await scoped(second,()=>id("insert into drivers(name,phone) values('Foreign','')"));
   await assert.rejects(tx(()=>bindAccount(c,legacy,{email:'applicant@example.test',role:'DRIVER',driverId:foreignDriver,studentIds:[],requestId:request})),/driver/);
   await tx(()=>bindAccount(c,legacy,{email:'applicant@example.test',role:'PARENT',driverId:null,studentIds:[],requestId:request}));
   assert.equal((await c.query('select status from tenant_join_requests where id=$1',[request])).rows[0].status,'APPROVED');
   assert.equal((await c.query('select * from app_users where account_id=$1 and tenant_id=$2',[applicant,first])).rowCount,1);
   await assert.rejects(tx(()=>bindAccount(c,legacy,{email:'applicant@example.test',role:'ADMIN',driverId:null,studentIds:[],requestId:request})),/request/);
  });
  await t.test('a login selects one institution once; disabled/unbound institutions cannot be entered',async()=>{
   await c.query("insert into account_sessions(token_hash,account_id,expires_at) values('new-session',$1,now()+interval '1 day')",[legacy]);
   assert.equal(await tx(()=>selectTenant(c,'new-session',second)),'ADMIN');
   await assert.rejects(tx(()=>selectTenant(c,'new-session',first)),/Sign out/);
   await c.query("insert into account_sessions(token_hash,account_id,expires_at) values('applicant-session',$1,now()+interval '1 day')",[applicant]);
   await assert.rejects(tx(()=>selectTenant(c,'applicant-session',second)),/unavailable/);
   await c.query('update app_users set active=false where account_id=$1 and tenant_id=$2',[applicant,first]);
   await assert.rejects(tx(()=>selectTenant(c,'applicant-session',first)),/unavailable/);
  });
  await t.test('global password changes invalidate sessions in all institutions',async()=>{
   const form=new FormData();form.set('currentPassword','tenant-test-password');form.set('newPassword','changed-test-password');form.set('confirmPassword','changed-test-password');
   await tx(()=>changeOwnPassword(c,legacy,form));
   assert.equal((await c.query('select * from account_sessions where account_id=$1',[legacy])).rowCount,0);
   assert.ok(await verifyPassword('changed-test-password',(await c.query('select password_hash from login_accounts where id=$1',[legacy])).rows[0].password_hash));
  });
  await t.test('pooled transaction cleanup leaves no tenant or role behind',async()=>{
   const r=(await c.query("select current_user, nullif(current_setting('kidloop.tenant_id',true),'') as tenant")).rows[0];
   assert.notEqual(r.current_user,'kidloop_runtime');assert.equal(r.tenant,null);
  });
 } finally {await c.query('rollback');await c.query(`drop schema ${schema} cascade`);c.release();await pool.end();}
});
