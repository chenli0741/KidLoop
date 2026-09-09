import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import pg from 'pg';
import {readFixedRoutes,routeForm,saveFixedRoute,materializeRoutes} from '../src/lib/fixed-routes';
import {readTrialRange} from '../src/lib/schedule-trial-data';
import {readRosterData} from '../src/lib/roster-data';
import type {FixedRoute} from '../src/lib/fixed-route-types';

test('automatic school batch persists two shared routes, unique facts, exclusions, capacity and completed protection',async()=>{
 const url=process.env.KIDLOOP_TEST_DATABASE_URL;assert.ok(url&&['localhost','127.0.0.1'].includes(new URL(url).hostname));
 const pool=new pg.Pool({connectionString:url}),c=await pool.connect(),schema='automatic_'+randomUUID().replaceAll('-','');
 const id=async(sql:string,args:unknown[]=[]) => (await c.query(sql+' returning id',args)).rows[0].id as string;
 const tx=async(fn:()=>Promise<unknown>)=>{await c.query('begin');try{await fn();await c.query('commit');}catch(e){await c.query('rollback');throw e;}};
 try{
  await c.query(`create schema ${schema}`);await c.query(`set search_path to ${schema}`);
  for(const file of (await readdir('db/migrations')).filter(f=>f.endsWith('.sql')).sort())await c.query(await readFile('db/migrations/'+file,'utf8'));
  await c.query("insert into operating_terms(name,starts_on,ends_on) values('Term','2026-09-01','2026-12-18')");
  const school=await id("insert into schools(name,address) values('School','A')"),program=await id("insert into after_school_programs(name,address) values('Program','B')");
  await c.query("insert into school_terms(school_id,name,starts_on,ends_on) values($1,'Fall','2026-09-01','2026-12-18')",[school]);
  await c.query("insert into school_pickup_rules(school_id,name,weekdays,pickup_time,grades) values($1,'Pickup',array[5],'12:45',array['1'])",[school]);
  const children=[];for(let i=0;i<15;i++)children.push(await id("insert into students(school_id,program_id,name,photo_url,grade) values($1,$2,$3,'','1')",[school,program,'Child '+i]));
  await c.query('insert into term_students(operating_term_id,student_id,reviewed) select current_operating_term(),id,true from students');
  for(let i=0;i<2;i++){
   const driver=await id("insert into drivers(name,phone) values($1,'')",['D'+i]),vehicle=await id("insert into vehicles(name,plate,capacity) values($1,$1,12)",['V'+i]);
   const route:FixedRoute={id:'',name:'Route '+i,routeType:'RECURRING',startsOn:'2026-09-11',endsOn:'2026-12-18',weekdays:[5],enabled:true,updatedAt:'',driverId:driver,vehicleId:vehicle,stops:[{id:randomUUID(),schoolId:school,programId:null,name:'',address:'',time:'12:45',pickupTime:'12:45'},{id:randomUUID(),schoolId:null,programId:program,name:'',address:'',time:'13:00'}],students:[]};
   const form=routeForm(route);
   if(i===0)form.set('batches',JSON.stringify([{schoolId:school,pickupTime:'12:45',weekday:5,shared:true,excludedStudentIds:[],updatedAt:''}]));
   await tx(()=>saveFixedRoute(c,form));
  }
  assert.equal((await readFixedRoutes(c))[1].students.length,15);
  const preview=await readTrialRange(c,['2026-09-11']);assert.equal(preview.summaries[0].issueCount,0);
  assert.equal((await c.query('select count(*)::int n from trips')).rows[0].n,0,'trial never creates execution');
  await tx(()=>materializeRoutes(c,'2026-09-11','2026-09-09'));
  assert.equal((await c.query('select count(*)::int n from trips')).rows[0].n,2);
  assert.equal((await c.query('select count(*)::int n from trip_students')).rows[0].n,15);
  assert.equal((await c.query('select count(*)::int n from shared_pickup_members')).rows[0].n,30);
  const original=(await c.query('select id,student_id,trip_id from trip_students order by id')).rows;
  await tx(()=>materializeRoutes(c,'2026-09-11','2026-09-09'));
  assert.deepEqual((await c.query('select id,student_id,trip_id from trip_students order by id')).rows,original);
  let routes=await readFixedRoutes(c);const batch=(await readRosterData(c)).batches[0];
  const form=routeForm(routes[0]);form.set('batches',JSON.stringify([{...batch,excludedStudentIds:[children[0]]}]));await tx(()=>saveFixedRoute(c,form));
  assert.ok((await readFixedRoutes(c)).every(r=>r.students.length===14));
  assert.equal((await readTrialRange(c,['2026-09-11'],true)).days[0].issues.filter(i=>i.code==='UNASSIGNED').length,1);
  await tx(()=>materializeRoutes(c,'2026-09-11','2026-09-09'));
  assert.equal((await c.query('select count(*)::int n from trip_students')).rows[0].n,14);
  await c.query('update vehicles set capacity=6');
  assert.ok((await readTrialRange(c,['2026-09-18'])).summaries[0].issueCount>0);
  await tx(()=>materializeRoutes(c,'2026-09-18','2026-09-09'));
  assert.equal((await c.query("select count(*)::int n from trips where scheduled_date='2026-09-18' and status='PUBLISHED'")).rows[0].n,0);
  await c.query('update vehicles set capacity=12');
  await c.query("update trips set status='COMPLETED' where id=(select id from trips order by id limit 1)");
  const before=(await c.query('select id,student_id,trip_id from trip_students order by id')).rows;
  routes=await readFixedRoutes(c);await tx(()=>saveFixedRoute(c,routeForm({...routes[0],enabled:false})));
  await tx(()=>materializeRoutes(c,'2026-09-11','2026-09-09'));
  assert.deepEqual((await c.query('select id,student_id,trip_id from trip_students order by id')).rows,before);
 }finally{await c.query('set search_path to public');await c.query(`drop schema ${schema} cascade`);c.release();await pool.end();}
});
