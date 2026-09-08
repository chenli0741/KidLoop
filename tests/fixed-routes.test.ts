import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import pg from 'pg';
import {saveFixedRoute,readFixedRoutes,materializeRoutes} from '../src/lib/fixed-routes';

test('fixed multi-school route creates tasks once, skips holidays, changes driver and preserves started trips',async()=>{
 const url=process.env.KIDLOOP_TEST_DATABASE_URL; assert.ok(url&&['localhost','127.0.0.1'].includes(new URL(url).hostname));
 const pool=new pg.Pool({connectionString:url}),c=await pool.connect(),schema=`route_test_${randomUUID().replaceAll('-','')}`;
 const id=async(sql:string,args:unknown[]=[]) => (await c.query(sql+' returning id',args)).rows[0].id as string;
 const tx=async(fn:()=>Promise<unknown>)=>{await c.query('begin');try{await fn();await c.query('commit');}catch(e){await c.query('rollback');throw e;}};
 try {
  await c.query(`create schema ${schema}`); await c.query(`set search_path to ${schema}`);
  for(const file of (await readdir('db/migrations')).filter(f=>f.endsWith('.sql')).sort())await c.query(await readFile(`db/migrations/${file}`,'utf8'));
  await c.query("insert into operating_terms(name,starts_on,ends_on) values('Term','2026-09-01','2026-09-30')");
  const school=await id("insert into schools(name,address) values('A','A address')"),schoolB=await id("insert into schools(name,address) values('B','B address')");
  const program=await id("insert into after_school_programs(name,address) values('P','P address')");
  const driver=await id("insert into drivers(name,phone) values('D','1')"),backup=await id("insert into drivers(name,phone) values('Backup','2')");
  const vehicle=await id("insert into vehicles(name,plate,capacity) values('V','TEST',2)");
  const ids:string[]=[];
  for(const s of [school,schoolB]) {
   const cl=await id("insert into classrooms(school_id,name) values($1,'Class')",[s]);
   ids.push(await id("insert into students(classroom_id,program_id,name,photo_url,grade) values($1,$2,'Child','','1')",[cl,program]));
   await c.query("insert into school_terms(school_id,name,starts_on,ends_on) values($1,'Term','2026-09-01','2026-09-30')",[s]);
   await c.query("insert into school_pickup_rules(school_id,name,weekdays,pickup_time,grades) values($1,'Rule',array[1,2,3,4,5],'14:00',array['1'])",[s]);
  }
  await c.query('insert into term_students(operating_term_id,student_id,reviewed) select current_operating_term(),id,true from students');
  const stops=[{id:randomUUID(),name:'',address:'',schoolId:school,programId:null,time:'14:00'},{id:randomUUID(),name:'',address:'',schoolId:schoolB,programId:null,time:'14:20'},{id:randomUUID(),name:'',address:'',schoolId:null,programId:program,time:'15:00'}];
  const make=(extra:Record<string,string>={})=>{const f=new FormData();for(const [k,v]of Object.entries({name:'Route',startsOn:'2026-09-01',endsOn:'2026-09-30',driverId:driver,vehicleId:vehicle,enabled:'on',stops:JSON.stringify(stops),students:JSON.stringify(ids.map((studentId,i)=>({studentId,pickupStopId:stops[i].id,dropoffStopId:stops[2].id}))),...extra}))f.set(k,v);for(const d of [1,2,3,4,5])f.append('weekdays',String(d));return f;};
  await tx(()=>saveFixedRoute(c,make()));
  let route=(await readFixedRoutes(c))[0];assert.equal(route.name,'A → B → P');assert.equal(route.stops.length,3);assert.equal(route.stops[0].name,'A');
  await assert.rejects(tx(()=>saveFixedRoute(c,make({name:'Overlap'}))),/overlapping/);
  await tx(()=>materializeRoutes(c,'2026-09-07','2026-09-07'));await tx(()=>materializeRoutes(c,'2026-09-07','2026-09-07'));
  assert.equal((await c.query('select count(*)::int n from trips')).rows[0].n,1);
  assert.equal((await c.query('select count(*)::int n from trip_students')).rows[0].n,2);
  await c.query("insert into school_calendar_exceptions(school_id,name,starts_on,ends_on) values($1,'Holiday','2026-09-08','2026-09-08')",[school]);
  await tx(()=>materializeRoutes(c,'2026-09-08','2026-09-07'));
  assert.equal((await c.query("select count(*)::int n from trip_students ts join trips t on t.id=ts.trip_id where scheduled_date='2026-09-08'")).rows[0].n,1);
  assert.equal((await c.query("select jsonb_array_length(route_stops) n from trips where scheduled_date='2026-09-08'")).rows[0].n,2);
  await c.query("insert into school_calendar_exceptions(school_id,name,starts_on,ends_on,pickup_time) values($1,'Late dismissal','2026-09-09','2026-09-09','14:30')",[school]);
  await tx(()=>materializeRoutes(c,'2026-09-09','2026-09-07'));
  const adjusted=(await c.query("select route_stops from trips where scheduled_date='2026-09-09'")).rows[0].route_stops;
  assert.deepEqual(adjusted.map((s:{time:string})=>s.time),['14:30','14:50','15:30']);
  await tx(()=>materializeRoutes(c,'2026-09-12','2026-09-07'));
  assert.equal((await c.query("select count(*)::int n from trips where scheduled_date='2026-09-12'")).rows[0].n,0);
  await tx(()=>saveFixedRoute(c,make({id:route.id,updatedAt:route.updatedAt,driverId:backup})));
  await tx(()=>materializeRoutes(c,'2026-09-07','2026-09-07'));
  assert.equal((await c.query("select driver_id from driver_shifts sh join trips t on t.shift_id=sh.id where scheduled_date='2026-09-07'")).rows[0].driver_id,backup);
  await c.query("update trip_students set status='PICKED_UP',picked_up_at=now() where trip_id=(select id from trips where scheduled_date='2026-09-07')");
  route=(await readFixedRoutes(c))[0];await tx(()=>saveFixedRoute(c,make({id:route.id,updatedAt:route.updatedAt,driverId:driver})));
  await tx(()=>materializeRoutes(c,'2026-09-07','2026-09-07'));
  assert.equal((await c.query("select driver_id from driver_shifts sh join trips t on t.shift_id=sh.id where scheduled_date='2026-09-07'")).rows[0].driver_id,backup);
  await tx(()=>materializeRoutes(c,'2026-10-01','2026-09-07'));assert.equal((await c.query("select count(*)::int n from trips where scheduled_date='2026-10-01'")).rows[0].n,0);
 } finally {await c.query(`drop schema if exists ${schema} cascade`);c.release();await pool.end();}
});
