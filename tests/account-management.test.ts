import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile,readdir } from 'node:fs/promises';
import pg from 'pg';
import { saveAccount } from '../src/lib/account-management';
import type { AuthUser } from '../src/lib/types';

test('admin account edits preserve passwords, validate associations and revoke changed access',async()=>{
 const url=process.env.KIDLOOP_TEST_DATABASE_URL;assert.ok(url&&['localhost','127.0.0.1'].includes(new URL(url).hostname));
 const pool=new pg.Pool({connectionString:url}),c=await pool.connect(),schema=`account_test_${randomUUID().replaceAll('-','')}`;
 const id=async(sql:string,args:unknown[]=[]) => (await c.query(sql+' returning id',args)).rows[0].id as string;
 const tx=async(fn:()=>Promise<unknown>)=>{await c.query('begin');try{await fn();await c.query('commit');}catch(e){await c.query('rollback');throw e;}};
 const form=(values:Record<string,string|string[]>)=>{const f=new FormData();for(const[k,v]of Object.entries(values))for(const x of Array.isArray(v)?v:[v])f.append(k,x);return f;};
 try{
  await c.query(`create schema ${schema}`);await c.query(`set search_path to ${schema}`);
  for(const f of(await readdir('db/migrations')).filter(f=>f.endsWith('.sql')).sort())await c.query(await readFile(`db/migrations/${f}`,'utf8'));
  const admin=await id("insert into app_users(name,email,role,password_hash) values('Admin','admin@unit.local','ADMIN','original')");
  const actor:AuthUser={id:admin,name:'Admin',email:'admin@unit.local',role:'ADMIN',driverId:null};
  const parent=await id("insert into app_users(name,email,role,password_hash) values('Parent','parent@unit.local','PARENT','keep-password')");
  const school=await id("insert into schools(name,address) values('School','Address')"),cl=await id("insert into classrooms(school_id,name) values($1,'Class')",[school]),program=await id("insert into after_school_programs(name,address) values('Program','Address')");
  const child=await id("insert into students(name,grade,photo_url,classroom_id,program_id) values('Child','1','',$1,$2)",[cl,program]);
  await c.query('insert into user_students values($1,$2)',[parent,child]);
  await c.query("insert into user_sessions(token_hash,user_id,expires_at) values('test-token',$1,now()+interval '1 day')",[parent]);
  const version=async(user=parent)=>(await c.query('select updated_at::text v from app_users where id=$1',[user])).rows[0].v;
  const values={userId:parent,updatedAt:await version(),name:'New parent',email:'NEW@UNIT.LOCAL',phone:'555-0123',role:'PARENT',studentIds:[child]};
  await assert.rejects(tx(()=>saveAccount(c,{...actor,role:'DRIVER'},form(values))),/forbidden/);
  await tx(()=>saveAccount(c,actor,form(values)));
  const saved=(await c.query('select * from app_users where id=$1',[parent])).rows[0];assert.equal(saved.name,'New parent');assert.equal(saved.email,'new@unit.local');assert.equal(saved.phone,'555-0123');assert.equal(saved.password_hash,'keep-password');
  assert.equal((await c.query('select count(*)::int n from user_sessions where user_id=$1',[parent])).rows[0].n,1);
  await assert.rejects(tx(()=>saveAccount(c,actor,form(values))),/stale/);
  await assert.rejects(tx(async()=>saveAccount(c,actor,form({...values,updatedAt:await version(),email:actor.email}))),/unique/);
  assert.equal((await c.query('select count(*)::int n from user_students where user_id=$1',[parent])).rows[0].n,1);
  const driver=await id("insert into drivers(name,phone) values('Driver','555')");
  await tx(async()=>saveAccount(c,actor,form({...values,updatedAt:await version(),role:'DRIVER',driverId:driver})));
  assert.equal((await c.query('select driver_id from app_users where id=$1',[parent])).rows[0].driver_id,driver);
  assert.equal((await c.query('select count(*)::int n from user_students where user_id=$1',[parent])).rows[0].n,0);
  assert.equal((await c.query('select count(*)::int n from user_sessions where user_id=$1',[parent])).rows[0].n,0);
  await assert.rejects(tx(async()=>saveAccount(c,actor,form({...values,userId:admin,updatedAt:await version(admin),role:'PARENT',email:actor.email}))),/selfRole/);
 }finally{await c.query(`drop schema if exists ${schema} cascade`);c.release();await pool.end();}
});
