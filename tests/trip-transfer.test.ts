import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import pg from 'pg';
import {listTripTransferDrivers,transferTripDriver} from '../src/lib/trip-transfer';
import {materializeTrial} from '../src/lib/schedule-materialize';
import type {AuthUser} from '../src/lib/types';

test('ride transfer lists other signed-in drivers and persists one-trip ownership with audit history',async()=>{
 const url=process.env.KIDLOOP_TEST_DATABASE_URL;assert.ok(url&&['localhost','127.0.0.1'].includes(new URL(url).hostname));
 const c=new pg.Client({connectionString:url});await c.connect();const schema=`transfer_test_${randomUUID().replaceAll('-','')}`;
 const id=async(sql:string,args:unknown[]=[]) => (await c.query(sql+' returning id',args)).rows[0].id as string;
 try{
  await c.query(`create schema ${schema}`);await c.query(`set search_path to ${schema}`);
  for(const file of (await readdir('db/migrations')).filter(file=>file.endsWith('.sql')&&!file.startsWith('047_')).sort())await c.query(await readFile(`db/migrations/${file}`,'utf8'));
  await c.query("select set_config('kidloop.tenant_id','00000000-0000-4000-8000-000000000001',false)");
  await c.query("insert into operating_terms(name,starts_on,ends_on) values('Test','2026-10-01','2026-12-31')");
  const school=await id("insert into schools(name,address,dismissal_time) values('School','Address','13:00')");
  const program=await id("insert into after_school_programs(name,address) values('Program','Address')");
  const vehicle=await id("insert into vehicles(name,plate,capacity) values('Van','TRANSFER',10)");
  const driver=await id("insert into drivers(name,phone) values('Current','1')");
  const eligible=await id("insert into drivers(name,phone) values('Eligible','2')");
  const busy=await id("insert into drivers(name,phone) values('Busy','3')");
  const unavailable=await id("insert into drivers(name,phone) values('Unavailable','4')");
  const tooLate=await id("insert into drivers(name,phone,earliest_dismissal_time) values('Too late','5','14:00')");
  await c.query("insert into drivers(name,phone,status) values('Off duty','6','OFF_DUTY')");
  await c.query("insert into drivers(name,phone) values('No account','7')");
  for(const [n,d] of [['current',driver],['eligible',eligible],['busy',busy],['unavailable',unavailable],['late',tooLate]] as const){
   const account=await id('insert into login_accounts(email,name,password_hash) values($1,$2,\'x\')',[`${n}@test.local`,n]);
   await c.query("insert into app_users(email,name,account_id,role,driver_id) values($1,$2,$3,'DRIVER',$4)",[`${n}@test.local`,n,account,d]);
  }
  const actor=(await c.query("select id,email from app_users where driver_id=$1",[driver])).rows[0];
  const user={id:actor.id,email:actor.email,name:'Current',role:'DRIVER',driverId:driver} as AuthUser;
  const route=await id("insert into fixed_routes(name,starts_on,ends_on,weekdays,driver_id,vehicle_id,enabled) values('Route','2026-10-01','2026-12-31',array[1],$1,$2,true)",[driver,vehicle]);
  const schoolStop=randomUUID(),programStop=randomUUID();
  await c.query("insert into fixed_route_stops(id,route_id,position,school_id,name,address,arrival_time,pickup_time) values($1,$2,0,$3,'School','Address','13:00','13:00')",[schoolStop,route,school]);
  await c.query("insert into fixed_route_stops(id,route_id,position,program_id,name,address,arrival_time) values($1,$2,1,$3,'Program','Address','14:00')",[programStop,route,program]);
  const shift=await id("insert into driver_shifts(driver_id,vehicle_id,shift_date,start_time,end_time) values($1,$2,'2026-10-05','13:00','14:00')",[driver,vehicle]);
  const trip=await id(`insert into trips(shift_id,school_id,program_id,scheduled_date,departure_time,route_stops,fixed_route_id)
   values($1,$2,$3,'2026-10-05','13:00',$4,$5)`,[shift,school,program,JSON.stringify([{id:schoolStop,name:'School',address:'Address',schoolId:school,programId:null,time:'13:00'},{id:programStop,name:'Program',address:'Address',schoolId:null,programId:program,time:'14:00'}]),route]);
  const busyShift=await id("insert into driver_shifts(driver_id,vehicle_id,shift_date,start_time,end_time) values($1,$2,'2026-10-05','13:30','14:30')",[busy,vehicle]);
  await c.query("insert into trips(shift_id,school_id,program_id,scheduled_date,departure_time) values($1,$2,$3,'2026-10-05','13:30')",[busyShift,school,program]);
  await c.query("insert into driver_unavailability(driver_id,starts_on,ends_on,weekdays,reason) values($1,'2026-10-05','2026-10-05',array[1,2,3,4,5,6,7],'Away')",[unavailable]);
  assert.deepEqual(await listTripTransferDrivers(c as unknown as pg.PoolClient,user,trip),[
   {id:busy,name:'Busy'},{id:eligible,name:'Eligible'},{id:tooLate,name:'Too late'},{id:unavailable,name:'Unavailable'},
  ]);
  const moved=await transferTripDriver(c as unknown as pg.PoolClient,user,trip,eligible);assert.equal(moved.id,eligible);
  assert.equal((await c.query('select driver_id from driver_shifts where id=$1',[shift])).rows[0].driver_id,eligible);
  const history=(await c.query('select from_driver_id,to_driver_id,actor_id from trip_driver_transfers where trip_id=$1',[trip])).rows[0];
  assert.deepEqual(history,{from_driver_id:driver,to_driver_id:eligible,actor_id:actor.id});
  await c.query('update fixed_routes set driver_id=$2 where id=$1',[route,busy]);
  await materializeTrial(c as unknown as pg.PoolClient,'2026-10-05');
  assert.equal((await c.query('select driver_id from driver_shifts where id=$1',[shift])).rows[0].driver_id,eligible,'automatic scheduling preserves the manual transfer');
  await assert.rejects(listTripTransferDrivers(c as unknown as pg.PoolClient,user,trip),/unavailable/);
  const recipient={...user,driverId:eligible};
  await c.query("update trips set status='IN_PROGRESS' where id=$1",[trip]);
  await assert.rejects(listTripTransferDrivers(c as unknown as pg.PoolClient,recipient,trip),/unavailable/);
  await c.query("update trips set status='COMPLETED' where id=$1",[trip]);
  await assert.rejects(listTripTransferDrivers(c as unknown as pg.PoolClient,recipient,trip),/unavailable/);
 }finally{await c.query(`drop schema ${schema} cascade`);await c.end();}
});
