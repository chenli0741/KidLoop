import {saveDriverPreferences} from '../src/lib/driver-preferences-data';
import {readTrialInput} from '../src/lib/schedule-trial-data';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import pg from 'pg';
import {materializeRoutes} from '../src/lib/fixed-routes';
import {readTrialRange} from '../src/lib/schedule-trial-data';
import {readDriverRuns} from '../src/lib/driver-familiarity-data';

test('extra trips persist idempotently, preview never writes trips, history learns only actual service, started trips survive rule changes',async()=>{
 const url=process.env.KIDLOOP_TEST_DATABASE_URL;assert.ok(url&&['localhost','127.0.0.1'].includes(new URL(url).hostname));
 const c=new pg.Client({connectionString:url});await c.connect();const schema=`extra_test_${randomUUID().replaceAll('-','')}`;
 const id=async(sql:string,args:unknown[]=[]) => (await c.query(sql+' returning id',args)).rows[0].id as string;
 try{
  await c.query(`create schema ${schema}`);await c.query(`set search_path to ${schema}`);
  // 047 is a production-only school data import requiring the real McAuliffe record.
  for(const file of (await readdir('db/migrations')).filter(f=>f.endsWith('.sql')&&!f.startsWith('047_')).sort())await c.query(await readFile(`db/migrations/${file}`,'utf8'));
  await c.query("insert into operating_terms(name,starts_on,ends_on) values('Test','2026-09-01','2026-09-30')");
  const school=await id("insert into schools(name,address) values('A','A')"),other=await id("insert into schools(name,address) values('B','B')"),program=await id("insert into after_school_programs(name,address) values('P','P')");
  const driver=await id("insert into drivers(name,phone) values('Usual','')"),vehicle=await id("insert into vehicles(name,plate,capacity) values('Van','EXTRA-TEST',5)");
  const children:string[]=[];
  for(const [schoolId,grade] of [[school,'K'],[school,'3'],[other,'1']]){
   const classroom=await id("insert into classrooms(school_id,name) values($1,$2)",[schoolId,grade]);
   children.push(await id("insert into students(classroom_id,program_id,name,photo_url,grade) values($1,$2,$3,'',$3)",[classroom,program,grade]));
  }
  await c.query('insert into term_students(operating_term_id,student_id,reviewed) select current_operating_term(),id,true from students');
  for(const sid of [school,other]){
   await c.query("insert into school_terms(school_id,name,starts_on,ends_on) values($1,'Test','2026-09-01','2026-09-30')",[sid]);
   await c.query("insert into school_pickup_rules(school_id,name,weekdays,pickup_time,grades) values($1,'Normal',array[1,2,3,4,5],'14:30',array['K','1','3'])",[sid]);
  }
  await c.query(`insert into school_calendar_schedules(school_id,name,starts_on,ends_on,grade_times) values($1,'K early week','2026-09-14','2026-09-18','[{"grades":["K"],"time":"12:45"}]')`,[school]);
  const route=await id("insert into fixed_routes(name,starts_on,ends_on,weekdays,driver_id,vehicle_id,enabled) values('A B P','2026-09-01','2026-09-30',array[1,2,3,4,5],$1,$2,true)",[driver,vehicle]);
  for(const [position,sid,pid,name,time] of [[0,school,null,'A','14:30'],[1,other,null,'B','14:40'],[2,null,program,'P','14:50']])await c.query("insert into fixed_route_stops(id,route_id,position,school_id,program_id,name,address,arrival_time,pickup_time) values($1,$2,$3,$4,$5,$6,$6,$7,$8)",[randomUUID(),route,position,sid,pid,name,time,sid?'14:30':null]);
  for(const [a,b,n] of [['A','B',10],['B','P',10],['A','P',15],['P','A',20]])await c.query('insert into travel_time_profiles(from_name,to_name,estimated_minutes,buffer_minutes) values($1,$2,$3,0)',[a,b,n]);
  await saveDriverPreferences(c as unknown as pg.PoolClient,driver,{earliestDismissalTime:'12:00',latestDismissalTime:'15:00',schoolPreferenceMode:'PREFER',preferredSchoolIds:[school]});
  const reloaded=await readTrialInput(c as unknown as pg.PoolClient,'2026-09-15','2026-09-15');
  assert.deepEqual(reloaded.drivers[0].preferredSchoolIds,[school]);assert.equal(reloaded.drivers[0].schoolPreferenceMode,'PREFER');assert.equal(reloaded.drivers[0].latestDismissalTime,'15:00');
  await assert.rejects(saveDriverPreferences(c as unknown as pg.PoolClient,driver,{schoolPreferenceMode:'ONLY',preferredSchoolIds:[randomUUID()]}));
  const preview=await readTrialRange(c as unknown as pg.PoolClient,['2026-09-15'],true);assert.equal(preview.days[0].plans.length,2);assert.equal((await c.query('select count(*)::int n from trips')).rows[0].n,0);
  const generate=async()=>{await c.query('begin');try{await materializeRoutes(c as unknown as pg.PoolClient,'2026-09-15','2026-09-14');await c.query('commit');}catch(e){await c.query('rollback');throw e;}};
  await generate();const first=(await c.query('select id,generated_plan_id,status from trips order by id')).rows;assert.equal(first.length,2);assert.equal(first.filter(t=>t.generated_plan_id).length,1);
  const assignments=(await c.query('select id,student_id,trip_id from trip_students order by id')).rows;assert.equal(assignments.length,3);
  await generate();assert.deepEqual((await c.query('select id,generated_plan_id,status from trips order by id')).rows,first);assert.deepEqual((await c.query('select id,student_id,trip_id from trip_students order by id')).rows,assignments);
  assert.equal((await readDriverRuns(c as unknown as pg.PoolClient,'2026-09-15','2026-09-17')).length,0);
  const extra=first.find(t=>t.generated_plan_id)!;const pickup=(await c.query('select id from trip_students where trip_id=$1',[extra.id])).rows[0].id;
  await c.query("update trip_students set status='PICKED_UP',picked_up_at=now() where id=$1",[pickup]);await c.query("update trips set status='IN_PROGRESS' where id=$1",[extra.id]);
  assert.equal((await readDriverRuns(c as unknown as pg.PoolClient,'2026-09-15','2026-09-17')).length,1);
  await c.query('delete from school_calendar_schedules where school_id=$1',[school]);await generate();
  assert.equal((await c.query('select status from trips where id=$1',[extra.id])).rows[0].status,'IN_PROGRESS');assert.equal((await c.query('select trip_id from trip_students where id=$1',[pickup])).rows[0].trip_id,extra.id);
  assert.equal((await c.query('select count(*)::int n from trip_students where student_id=$1',[children[0]])).rows[0].n,1);
  assert.equal((await c.query("select count(*)::int n from trips where fixed_route_id=$1 and status='PUBLISHED'",[route])).rows[0].n,1);
  assert.equal((await c.query('select count(*)::int n from trip_students ts join trips t on t.id=ts.trip_id where t.fixed_route_id=$1',[route])).rows[0].n,2);
  await saveDriverPreferences(c as unknown as pg.PoolClient,driver,{schoolPreferenceMode:'ONLY',preferredSchoolIds:[other]});
  await generate();
  assert.equal((await c.query('select status from trips where id=$1',[extra.id])).rows[0].status,'IN_PROGRESS','new restrictions retain started execution');
  assert.equal((await c.query('select status from trips where fixed_route_id=$1',[route])).rows[0].status,'CANCELED','unstarted mixed route cannot violate ONLY');
  await saveDriverPreferences(c as unknown as pg.PoolClient,driver,{schoolPreferenceMode:'NONE',preferredSchoolIds:[]});
  assert.deepEqual((await readTrialInput(c as unknown as pg.PoolClient,'2026-09-15','2026-09-15')).drivers[0].preferredSchoolIds,[]);
 }finally{await c.query(`drop schema ${schema} cascade`);await c.end();}
});
