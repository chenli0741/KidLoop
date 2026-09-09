import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import pg from 'pg';
import {saveFixedRoute,readFixedRoutes,materializeRoutes} from '../src/lib/fixed-routes';
import {readDriverScheduleOverview} from '../src/lib/driver-schedule-overview';

test('temporary route transfers four of ten, reconciles either driver scope, restores and protects execution',async()=>{
 const url=process.env.KIDLOOP_TEST_DATABASE_URL;assert.ok(url&&['localhost','127.0.0.1'].includes(new URL(url).hostname));
 const pool=new pg.Pool({connectionString:url}),c=await pool.connect(),schema=`temporary_${randomUUID().replaceAll('-','')}`;
 const id=async(sql:string,args:unknown[]=[]) => (await c.query(sql+' returning id',args)).rows[0].id as string;
 const tx=async(fn:()=>Promise<unknown>)=>{await c.query('begin');try{await fn();await c.query('commit');}catch(e){await c.query('rollback');throw e;}};
 try{
  await c.query(`create schema ${schema}`);await c.query(`set search_path to ${schema}`);
  for(const file of (await readdir('db/migrations')).filter(f=>f.endsWith('.sql')).sort())await c.query(await readFile(`db/migrations/${file}`,'utf8'));
  await c.query("insert into operating_terms(name,starts_on,ends_on) values('Term','2026-09-01','2026-09-30')");
  const school=await id("insert into schools(name,address) values('School','Address')"),program=await id("insert into after_school_programs(name,address) values('Program','Address')");
  const driver=await id("insert into drivers(name,phone) values('Original','1')"),temporaryDriver=await id("insert into drivers(name,phone) values('Temporary','2')");
  const vehicle=await id("insert into vehicles(name,plate,capacity) values('Original','ORIGINAL',10)"),temporaryVehicle=await id("insert into vehicles(name,plate,capacity) values('Temporary','TEMP',4)");
  await c.query("insert into school_terms(school_id,name,starts_on,ends_on) values($1,'Term','2026-09-01','2026-09-30')",[school]);
  await c.query("insert into school_pickup_rules(school_id,name,weekdays,pickup_time,grades) values($1,'Rule',array[1,2,3,4,5],'14:00',array['3'])",[school]);
  const students:string[]=[];
  for(let i=0;i<10;i++)students.push(await id("insert into students(school_id,program_id,name,grade,photo_url) values($1,$2,$3,'3','')",[school,program,`Student ${i}`]));
  await c.query('insert into term_students(operating_term_id,student_id,reviewed) select current_operating_term(),id,true from students');
  const make=(temporary:boolean,extra:Record<string,string>={})=>{
   const stops=[{id:randomUUID(),schoolId:school,programId:null,name:'',address:'',time:'14:00'},{id:randomUUID(),schoolId:null,programId:program,name:'',address:'',time:'14:30'}];
   const f=new FormData();
   for(const [key,value] of Object.entries({routeType:temporary?'TEMPORARY':'RECURRING',startsOn:temporary?'2026-09-08':'2026-09-01',endsOn:temporary?'2026-09-10':'2026-09-30',driverId:temporary?temporaryDriver:driver,vehicleId:temporary?temporaryVehicle:vehicle,enabled:'on',stops:JSON.stringify(stops),students:JSON.stringify((temporary?students.slice(0,4):students).map(studentId=>({studentId,pickupStopId:stops[0].id,dropoffStopId:stops[1].id}))),...extra}))f.set(key,value);
   for(const d of [1,2,3,4,5])f.append('weekdays',String(d));return f;
  };
  await tx(()=>saveFixedRoute(c,make(false)));
  const original=(await readFixedRoutes(c))[0];
  await tx(()=>materializeRoutes(c,'2026-09-08','2026-09-01',driver));
  const before=(await c.query('select ts.id,ts.student_id from trip_students ts join trips t on t.id=ts.trip_id where t.scheduled_date=$1',['2026-09-08'])).rows;
  const absentId=before.find(s=>s.student_id===students[0])!.id;
  const parent=await id("insert into app_users(name,email,role,password_hash) values('Parent','parent@example.test','PARENT','no-login')");
  await c.query("insert into student_day_plans(student_id,service_date,absent,updated_by) values($1,'2026-09-08',true,$2)",[students[0],parent]);
  await c.query("update trip_students set status='ABSENT',parent_absence=true where id=$1",[absentId]);
  await c.query("insert into status_history(trip_student_id,from_status,to_status,note) values($1,'SCHEDULED','ABSENT','Parent absence')",[absentId]);
  await tx(()=>saveFixedRoute(c,make(true)));
  let temporary=(await readFixedRoutes(c)).find(r=>r.routeType==='TEMPORARY')!;
  const countBefore=(await c.query('select count(*)::int n from trips')).rows[0].n;
  const dates=['2026-08-31','2026-09-09','2026-09-10','2026-09-11','2026-09-12'];
  assert.deepEqual([...await readDriverScheduleOverview(c,driver,dates,'2026-09-08')].map(([,has])=>has),[false,true,true,true,false]);
  assert.deepEqual([...await readDriverScheduleOverview(c,temporaryDriver,dates,'2026-09-08')].map(([,has])=>has),[false,true,true,false,false]);
  assert.equal((await c.query('select count(*)::int n from trips')).rows[0].n,countBefore,'Calendar overview must not materialize trips');
  await c.query("insert into school_calendar_exceptions(school_id,name,starts_on,ends_on) values($1,'Holiday','2026-09-14','2026-09-14')",[school]);
  assert.equal((await readDriverScheduleOverview(c,driver,['2026-09-14'],'2026-09-08')).get('2026-09-14'),false);
  await assert.rejects(tx(()=>saveFixedRoute(c,make(true))),/overlapping/);
  const duplicate=make(true);
  duplicate.set('stops',JSON.stringify(JSON.parse(String(duplicate.get('stops'))).map((s:Record<string,unknown>,i:number)=>({...s,time:i?'16:30':'16:00'}))));
  await assert.rejects(tx(()=>saveFixedRoute(c,duplicate)),/overlapping/);
  await assert.rejects(tx(()=>saveFixedRoute(c,make(true,{driverId:driver,vehicleId:vehicle}))),/overlapping/);
  const roster=async(date:string)=>(await c.query<{route_type:string;n:number}>(`select r.route_type,count(ts.id)::int n from trips t join fixed_routes r on r.id=t.fixed_route_id join trip_students ts on ts.trip_id=t.id where t.scheduled_date=$1 and t.status<>'CANCELED' group by r.route_type order by r.route_type`,[date])).rows;
  const split=[{route_type:'RECURRING',n:6},{route_type:'TEMPORARY',n:4}];
  await tx(()=>materializeRoutes(c,'2026-09-08','2026-09-01',driver));
  assert.deepEqual(await roster('2026-09-08'),split);
  const after=(await c.query('select ts.id,ts.student_id from trip_students ts join trips t on t.id=ts.trip_id where t.scheduled_date=$1',['2026-09-08'])).rows;
  assert.deepEqual(after.sort((a,b)=>a.id.localeCompare(b.id)),before.sort((a,b)=>a.id.localeCompare(b.id)));
  assert.equal((await c.query('select parent_absence from trip_students where id=$1',[absentId])).rows[0].parent_absence,true);
  assert.equal((await c.query('select count(*)::int n from status_history where trip_student_id=$1',[absentId])).rows[0].n,1);
  await tx(()=>materializeRoutes(c,'2026-09-08','2026-09-01',temporaryDriver));assert.deepEqual(await roster('2026-09-08'),split);
  // The temporary driver's first read must also populate the original driver's remaining six.
  await tx(()=>materializeRoutes(c,'2026-09-09','2026-09-01',temporaryDriver));assert.deepEqual(await roster('2026-09-09'),split);
  await tx(()=>materializeRoutes(c,'2026-09-10','2026-09-01',driver));assert.deepEqual(await roster('2026-09-10'),split);
  const reduced=make(true,{id:temporary.id,updatedAt:temporary.updatedAt});
  reduced.set('students',JSON.stringify(JSON.parse(String(reduced.get('students'))).slice(0,2)));
  await tx(()=>saveFixedRoute(c,reduced));
  await tx(()=>materializeRoutes(c,'2026-09-10','2026-09-01',temporaryDriver));
  assert.deepEqual(await roster('2026-09-10'),[{route_type:'RECURRING',n:8},{route_type:'TEMPORARY',n:2}]);
  temporary=(await readFixedRoutes(c)).find(r=>r.id===temporary.id)!;
  await tx(()=>saveFixedRoute(c,make(true,{id:temporary.id,updatedAt:temporary.updatedAt})));
  temporary=(await readFixedRoutes(c)).find(r=>r.id===temporary.id)!;
  await tx(()=>materializeRoutes(c,'2026-09-11','2026-09-01',driver));assert.deepEqual(await roster('2026-09-11'),[{route_type:'RECURRING',n:10}]);
  assert.equal((await c.query('select count(*)::int n from fixed_route_students where route_id=$1',[original.id])).rows[0].n,10);
  // Disabling restores pre-generated days and re-enabling moves them again without duplicates.
  await tx(()=>saveFixedRoute(c,make(true,{id:temporary.id,updatedAt:temporary.updatedAt,enabled:''})));
  await tx(()=>materializeRoutes(c,'2026-09-08','2026-09-01',temporaryDriver));assert.deepEqual(await roster('2026-09-08'),[{route_type:'RECURRING',n:10}]);
  temporary=(await readFixedRoutes(c)).find(r=>r.id===temporary.id)!;
  await tx(()=>saveFixedRoute(c,make(true,{id:temporary.id,updatedAt:temporary.updatedAt})));
  await tx(()=>materializeRoutes(c,'2026-09-08','2026-09-01',driver));assert.deepEqual(await roster('2026-09-08'),split);
  // A failed temporary vehicle cannot leave four students unassigned.
  await c.query("update vehicles set status='MAINTENANCE' where id=$1",[temporaryVehicle]);
  await tx(()=>materializeRoutes(c,'2026-09-09','2026-09-01',driver));assert.deepEqual(await roster('2026-09-09'),[{route_type:'RECURRING',n:10}]);
  await c.query("update vehicles set status='AVAILABLE' where id=$1",[temporaryVehicle]);
  // Once the source has begun, retain all its riders and report the conflict.
  await c.query("update trip_students set status='PICKED_UP',picked_up_at=now() where student_id=$1 and trip_id in(select id from trips where scheduled_date='2026-09-09' and fixed_route_id=$2)",[students[9],original.id]);
  await tx(()=>materializeRoutes(c,'2026-09-09','2026-09-01',temporaryDriver));assert.deepEqual(await roster('2026-09-09'),[{route_type:'RECURRING',n:10}]);
  assert.ok((await c.query("select 1 from route_task_issues where route_id=$1 and service_date='2026-09-09'",[temporary.id])).rowCount);
 }finally{await c.query(`drop schema ${schema} cascade`);c.release();await pool.end();}
});
