import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import pg from 'pg';
import {configureRouteSharing,readFixedRoutes,routeForm,saveFixedRoute,materializeRoutes} from '../src/lib/fixed-routes';
import {archiveOperatingTerm,createOperatingTerm} from '../src/lib/operating-terms';
import {changeRiderStatus} from '../src/lib/rider-status';
import {addSharedRiders} from '../src/lib/shared-pickups';
import type {AuthUser,Trip} from '../src/lib/types';
import type {FixedRoute} from '../src/lib/fixed-route-types';

test('recurring shared pair enables, generates together, syncs unstarted records and reserves fixed seats',async()=>{
 const url=process.env.KIDLOOP_TEST_DATABASE_URL;assert.ok(url&&['localhost','127.0.0.1'].includes(new URL(url).hostname));
 const pool=new pg.Pool({connectionString:url}),c=await pool.connect(),schema='shared_routes_'+randomUUID().replaceAll('-','');
 const id=async(sql:string,args:unknown[]=[]) => (await c.query(sql+' returning id',args)).rows[0].id as string;
 const tx=async<T>(fn:()=>Promise<T>)=>{await c.query('begin');try{const result=await fn();await c.query('commit');return result;}catch(e){await c.query('rollback');throw e;}};
 try{
  await c.query(`create schema ${schema}`);await c.query(`set search_path to ${schema}`);
  for(const file of (await readdir('db/migrations')).filter(f=>f.endsWith('.sql')).sort())await c.query(await readFile('db/migrations/'+file,'utf8'));
  await c.query("insert into operating_terms(name,starts_on,ends_on) values('Term','2026-09-01','2026-12-18')");
  const school=await id("insert into schools(name,address) values('Cumberland','A')"),cherry=await id("insert into schools(name,address) values('Cherry','B')"),program=await id("insert into after_school_programs(name,address) values('Little Tree','C')");
  for(const s of [school,cherry]){
   await c.query("insert into school_terms(school_id,name,starts_on,ends_on) values($1,'Fall','2026-09-01','2026-12-18')",[s]);
   await c.query("insert into school_pickup_rules(school_id,name,weekdays,pickup_time,grades) values($1,'Pickup',array[5],$2,array['1'])",[s,s===school?'12:45':'12:57']);
  }
  const shared:string[]=[],fixed:string[]=[];
  for(let i=0;i<21;i++)(i<16?shared:fixed).push(await id("insert into students(school_id,program_id,name,photo_url,grade) values($1,$2,$3,'','1')",[i<16?school:cherry,program,'Child '+i]));
  await c.query('insert into term_students(operating_term_id,student_id,reviewed) select current_operating_term(),id,true from students');
  const drivers:AuthUser[]=[];
  for(let i=0;i<2;i++){
   const driver=await id("insert into drivers(name,phone) values($1,'')",['D'+i]),vehicle=await id("insert into vehicles(name,plate,capacity) values($1,$1,12)",['V'+i]);
   const actor=await id("insert into app_users(name,email,role,password_hash,driver_id) values($1,$2,'DRIVER','x',$3)",['D'+i,'d'+i+'@test',driver]);
   drivers.push({id:actor,role:'DRIVER',driverId:driver,name:'D'+i,email:'d'+i+'@test'});
   const stops=[{id:randomUUID(),schoolId:school,programId:null,name:'Cumberland',address:'A',time:'12:45'},...(i===0?[{id:randomUUID(),schoolId:cherry,programId:null,name:'Cherry',address:'B',time:'12:57'}]:[]),{id:randomUUID(),schoolId:null,programId:program,name:'Little Tree',address:'C',time:'13:09'}];
   const route:FixedRoute={id:'',name:'Route '+i,routeType:'RECURRING',startsOn:'2026-09-11',endsOn:'2026-12-18',weekdays:[5],enabled:false,updatedAt:'',driverId:driver,vehicleId:vehicle,stops,students:i===0?[...shared.map(studentId=>({studentId,pickupStopId:stops[0].id,dropoffStopId:stops.at(-1)!.id})),...fixed.map(studentId=>({studentId,pickupStopId:stops[1].id,dropoffStopId:stops.at(-1)!.id}))]:[]};
   await tx(()=>saveFixedRoute(c,routeForm(route)));
  }
  let routes=await readFixedRoutes(c);
  await assert.rejects(tx(()=>saveFixedRoute(c,routeForm({...routes[0],enabled:true}))),/capacity/i);
  const form=new FormData();for(const [key,value] of Object.entries({sourceRouteId:routes[0].id,partnerRouteId:routes[1].id,schoolId:school,sourceVersion:routes[0].updatedAt,partnerVersion:routes[1].updatedAt}))form.set(key,value);
  await tx(()=>configureRouteSharing(c,form));routes=await readFixedRoutes(c);
  assert.ok(routes.every(r=>r.enabled&&r.sharing));assert.equal(routes[1].students.length,16);
  await tx(()=>materializeRoutes(c,'2026-09-11','2026-09-09',drivers[1].driverId!));
  assert.deepEqual((await c.query('select message from route_task_issues')).rows,[]);
  let trips=(await c.query('select id,fixed_route_id from trips order by route_name')).rows;
  assert.equal(trips.length,2);assert.equal((await c.query('select count(*)::int n from trip_students')).rows[0].n,21);
  assert.equal((await c.query('select count(*)::int n from shared_pickup_members')).rows[0].n,32);
  const original=(await c.query('select id,student_id from trip_students order by id')).rows;
  await tx(()=>materializeRoutes(c,'2026-09-11','2026-09-09',drivers[0].driverId!));
  assert.deepEqual((await c.query('select id,student_id from trip_students order by id')).rows,original);
  const manifests=await addSharedRiders(c,trips.map(t=>({id:t.id,riders:[]} as unknown as Trip)),drivers[0]);assert.ok(manifests.every(t=>t.riders.length===16));
  // Weekly exclusions and parent absence affect the dated roster without changing templates.
  await c.query('update students set no_pickup_weekdays=array[5] where id=$1',[shared[0]]);
  await tx(()=>materializeRoutes(c,'2026-09-18','2026-09-09',drivers[1].driverId!));
  assert.equal((await c.query("select count(*)::int n from shared_pickup_members m join trips t on t.id=m.trip_id where t.scheduled_date='2026-09-18'")).rows[0].n,30);
  await c.query("update students set no_pickup_weekdays='{}' where id=$1",[shared[0]]);
  // Combined capacity is enforced and a failed refresh cancels both unstarted legs.
  await c.query('update vehicles set capacity=6 where id=$1',[routes[1].vehicleId]);
  await assert.rejects(tx(()=>saveFixedRoute(c,routeForm(routes[0]))),/combined remaining seats/);
  await tx(()=>materializeRoutes(c,'2026-09-18','2026-09-09'));
  assert.equal((await c.query("select count(*)::int n from trips where scheduled_date='2026-09-18' and status='CANCELED'")).rows[0].n,2);
  assert.equal((await c.query("select count(*)::int n from route_task_issues where service_date='2026-09-18'")).rows[0].n,2);
  await c.query('update vehicles set capacity=12 where id=$1',[routes[1].vehicleId]);
  await tx(()=>materializeRoutes(c,'2026-09-18','2026-09-09'));
  assert.equal((await c.query("select count(*)::int n from route_task_issues where service_date='2026-09-18'")).rows[0].n,0);
  // Keep subsequent assertions scoped to the initial service day.
  await c.query("delete from shared_pickup_members where trip_id in(select id from trips where scheduled_date='2026-09-18')");
  await c.query("delete from trip_students where trip_id in(select id from trips where scheduled_date='2026-09-18')");
  await c.query("delete from trips where scheduled_date='2026-09-18'");
  await c.query("delete from driver_shifts where shift_date='2026-09-18'");
  // Source roster edits are mirrored and unstarted assignment ids remain stable.
  routes=await readFixedRoutes(c);
  await tx(()=>saveFixedRoute(c,routeForm({...routes[0],students:routes[0].students.filter(a=>a.studentId!==shared[15])})));
  await tx(()=>materializeRoutes(c,'2026-09-11','2026-09-09',drivers[1].driverId!));
  assert.equal((await c.query('select count(*)::int n from shared_pickup_members')).rows[0].n,30);
  assert.deepEqual((await c.query('select id,student_id from trip_students order by id')).rows,original.filter(r=>r.student_id!==shared[15]));
  // Existing manually published shared pair is adopted without duplicate trips or assignments.
  await c.query('update trips set fixed_route_id=null');
  await tx(()=>materializeRoutes(c,'2026-09-11','2026-09-09',drivers[1].driverId!));
  trips=(await c.query('select id,fixed_route_id from trips order by route_name')).rows;
  assert.equal(trips.length,2);assert.ok(trips.every(t=>t.fixed_route_id));
  const assignments=(await c.query('select id from trip_students where student_id=any($1::uuid[]) order by id',[shared])).rows;
  for(const a of assignments.slice(0,7))await tx(()=>changeRiderStatus(c,drivers[0],a.id,'PICKED_UP',undefined,trips[0].id));
  await assert.rejects(tx(()=>changeRiderStatus(c,drivers[0],assignments[7].id,'PICKED_UP',undefined,trips[0].id)),/CAPACITY_EXCEEDED/);
  await tx(()=>changeRiderStatus(c,drivers[1],assignments[7].id,'PICKED_UP',undefined,trips[1].id));
  await assert.rejects(tx(()=>changeRiderStatus(c,drivers[0],assignments[7].id,'PICKED_UP',undefined,trips[0].id)),/ALREADY_CLAIMED/);
  const executed=(await c.query('select * from trip_students order by id')).rows;
  await tx(()=>materializeRoutes(c,'2026-09-11','2026-09-09',drivers[1].driverId!));
  assert.deepEqual((await c.query('select * from trip_students order by id')).rows,executed);
  // Disabling either route disables both and cancels only unstarted future pairs.
  await tx(()=>materializeRoutes(c,'2026-09-18','2026-09-09'));
  routes=await readFixedRoutes(c);await tx(()=>saveFixedRoute(c,routeForm({...routes[1],enabled:false})));
  assert.ok((await readFixedRoutes(c)).every(r=>!r.enabled));
  await tx(()=>materializeRoutes(c,'2026-09-18','2026-09-09'));
  assert.ok((await c.query("select status from trips where scheduled_date='2026-09-18'")).rows.every(t=>t.status==='CANCELED'));
  const term=(await c.query("select id from operating_terms where status='OPEN'" )).rows[0];
  await tx(()=>archiveOperatingTerm(c,term.id,'2026-12-19'));
  assert.equal((await c.query('select snapshot from operating_terms where id=$1',[term.id])).rows[0].snapshot.fixed_route_sharing.length,1);
  const next=new FormData();for(const [key,value] of Object.entries({name:'Next term',startsOn:'2027-01-01',endsOn:'2027-06-01',source:term.id}))next.set(key,value);
  await tx(()=>createOperatingTerm(c,next));
  const copied=await readFixedRoutes(c);assert.equal(copied.length,2);assert.ok(copied.every(r=>!r.enabled&&r.sharing));
  assert.equal(copied[0].sharing!.sourceRouteId,copied[0].id);assert.equal(copied[0].sharing!.partnerRouteId,copied[1].id);
 }finally{await c.query(`drop schema ${schema} cascade`);c.release();await pool.end();}
});
