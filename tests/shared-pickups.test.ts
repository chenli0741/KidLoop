import {confirmCameraPickup} from '../src/lib/pickup-camera/confirm';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import pg from 'pg';
import {sharePickupSchool,addSharedRiders} from '../src/lib/shared-pickups';
import {finishTripSegment} from '../src/lib/finish-trip-segment';
import {photoAccessSql} from '../src/lib/student-photos';
import {changeRiderStatus} from '../src/lib/rider-status';
import type {AuthUser,Trip} from '../src/lib/types';

test('shared pickups: simultaneous claim, authorization, undo, fixed seat reservation, canonical history',async()=>{
 const url=process.env.KIDLOOP_TEST_DATABASE_URL;
 assert.ok(url&&['localhost','127.0.0.1'].includes(new URL(url).hostname));
 const schema='shared_'+randomUUID().replaceAll('-','');
 const pool=new pg.Pool({connectionString:url});const setup=await pool.connect();
 try{
 await setup.query(`create schema ${schema}`);await setup.query(`set search_path to ${schema}`);
 for(const file of (await readdir('db/migrations')).filter(f=>f.endsWith('.sql')).sort())await setup.query(await readFile('db/migrations/'+file,'utf8'));
 const insert=async(sql:string,args:unknown[]=[]) => (await setup.query(sql+' returning id',args)).rows[0].id as string;
 await setup.query("insert into operating_terms(name,starts_on,ends_on) values('T','2026-08-20','2026-12-18')");
 const school=await insert("insert into schools(name,address) values('Cumberland','a')");
 const cherry=await insert("insert into schools(name,address) values('Cherry Chase','b')");
 const program=await insert("insert into after_school_programs(name,address) values('Little Tree','c')");
 const admin:AuthUser={id:await insert("insert into app_users(name,email,role,password_hash) values('Admin','a@a','ADMIN','x')"),role:'ADMIN',driverId:null,name:'a',email:'a@a'};
 const tripIds:string[]=[],drivers:AuthUser[]=[];
 for(let i=0;i<2;i++){
 const d=await insert("insert into drivers(name,phone) values($1,'')",['Driver'+i]);
 const v=await insert("insert into vehicles(name,plate,capacity) values($1,$1,12)",['Little Tree '+i]);
 const sh=await insert("insert into driver_shifts(driver_id,vehicle_id,shift_date,start_time,end_time) values($1,$2,'2026-09-09','14:00','16:00')",[d,v]);
 const stops=[{id:randomUUID(),name:'Cumberland',schoolId:school,programId:null,address:'a',time:'14:30'},{id:randomUUID(),name:'Cherry Chase',schoolId:cherry,programId:null,address:'b',time:'14:45'},{id:randomUUID(),name:'Little Tree',schoolId:null,programId:program,address:'c',time:'15:00'}];
 const t=await insert("insert into trips(shift_id,scheduled_date,departure_time,route_stops) values($1,'2026-09-09','14:30',$2)",[sh,JSON.stringify(stops)]);tripIds.push(t);
 drivers.push({...admin,id:await insert("insert into app_users(name,email,role,password_hash,driver_id) values($1,$2,'DRIVER','x',$3)",['D'+i,'d'+i+'@a',d]),role:'DRIVER',driverId:d});
 for(let j=0;j<(i===0?5:8);j++){
 const s=await insert("insert into students(school_id,program_id,name,photo_url,grade) values($1,$2,$3,'','3')",[i===0?cherry:school,program,'Child'+i+j]);
 await setup.query('insert into trip_students(trip_id,student_id,pickup_stop_id,dropoff_stop_id) values($1,$2,$3,$4)',[t,s,stops[i===0?1:0].id,stops[2].id]);
 }
 }
 async function txn<T>(fn:(c:pg.PoolClient)=>Promise<T>){const c=await pool.connect();try{await c.query(`set search_path to ${schema}`);await c.query('begin');const r=await fn(c);await c.query('commit');return r;}catch(e){await c.query('rollback');throw e;}finally{c.release();}}
 await txn(c=>sharePickupSchool(c,admin,tripIds,school));
 const assignments=(await setup.query('select id from trip_students where trip_id=$1 order by id',[tripIds[1]])).rows.map(r=>r.id);
 const contact=await insert("insert into parents(name,relationship,phone) values('Parent private','Guardian','555-private')");
 await setup.query('update students set parent_id=$1',[contact]);
 const driverManifest=await addSharedRiders(setup,[{id:tripIds[0],riders:[]} as unknown as Trip],drivers[0]);
 assert.ok(driverManifest[0].riders.length>0);
 assert.ok(driverManifest[0].riders.every(r=>r.parentPhone===''&&r.parentName===''));
 const adminManifest=await addSharedRiders(setup,[{id:tripIds[0],riders:[]} as unknown as Trip],admin);
 assert.ok(adminManifest[0].riders.every(r=>r.parentPhone==='555-private'&&r.parentName==='Parent private'));
 const gps={status:'CAPTURED',latitude:37.4,longitude:-122.1,accuracyMeters:15,capturedAt:'2026-09-08T20:00:00.000Z'};
 await assert.rejects(txn(c=>confirmCameraPickup(c,admin,tripIds[0],[assignments[0]],gps)));
 await assert.rejects(txn(c=>confirmCameraPickup(c,drivers[0],tripIds[1],[assignments[0]],gps)));
 await assert.rejects(txn(c=>confirmCameraPickup(c,drivers[0],tripIds[0],assignments,gps)),/CAPACITY_EXCEEDED/);
 assert.equal((await setup.query("select count(*)::int n from status_history")).rows[0].n,0,'failed batch rolls back all riders and history');
 await txn(c=>confirmCameraPickup(c,drivers[0],tripIds[0],assignments.slice(0,2),gps));
 await assert.rejects(txn(c=>confirmCameraPickup(c,drivers[1],tripIds[1],assignments.slice(0,2),gps)));
 for(const id of assignments.slice(0,2))await txn(c=>changeRiderStatus(c,drivers[0],id,'SCHEDULED',undefined,tripIds[0],gps));
 const claim=(driver:number,id:string,next:'PICKED_UP'|'SCHEDULED'='PICKED_UP')=>txn(c=>changeRiderStatus(c,drivers[driver],id,next,undefined,tripIds[driver],gps));
 const race=await Promise.allSettled([claim(0,assignments[0]),claim(1,assignments[0])]);
 assert.equal(race.filter(r=>r.status==='fulfilled').length,1);
 const owner=(await setup.query('select trip_id from trip_students where id=$1',[assignments[0]])).rows[0].trip_id;
 const winner=tripIds.indexOf(owner),loser=1-winner;
 const projected=await addSharedRiders(setup,[{id:tripIds[loser],riders:[]} as unknown as Trip],drivers[loser]);
 assert.ok(projected[0].riders.find(r=>r.id===assignments[0])?.otherVehicle);
 await assert.rejects(claim(loser,assignments[0],'SCHEDULED'));
 await claim(winner,assignments[0],'SCHEDULED');
 const restored=await addSharedRiders(setup,[{id:tripIds[loser],riders:[]} as unknown as Trip],drivers[loser]);
 assert.equal(restored[0].riders.find(r=>r.id===assignments[0])?.otherVehicle,undefined);
 await assert.rejects(txn(c=>changeRiderStatus(c,{...drivers[0],driverId:randomUUID()},assignments[0],'PICKED_UP',undefined,tripIds[0])));
 for(const id of assignments.slice(0,7))await claim(0,id);
 await assert.rejects(claim(0,assignments[7]),/CAPACITY_EXCEEDED/);
 await claim(1,assignments[7]);

 const child=(await setup.query('select student_id from trip_students where id=$1',[assignments[0]])).rows[0].student_id;
 const photo=await insert("insert into student_photos(id,blob_url,student_id,uploaded_by) values(gen_random_uuid(),'https://example.invalid/private',$1,$2)",[child,admin.id]);
 await setup.query("update students set photo_url='/api/photos/'||$2::text where id=$1",[child,photo]);
 assert.equal((await setup.query(photoAccessSql,[photo,drivers[1].id,'DRIVER',drivers[1].driverId])).rowCount,1);
 assert.equal((await setup.query(photoAccessSql,[photo,drivers[1].id,'DRIVER',randomUUID()])).rowCount,0);
 const stops=(await setup.query('select route_stops from trips where id=$1',[tripIds[0]])).rows[0].route_stops;
 await txn(c=>finishTripSegment(c,drivers[0],tripIds[0],stops[0].id,stops[2].id,{status:'DENIED'}));
 assert.equal((await setup.query('select status from trip_students where id=$1',[assignments[0]])).rows[0].status,'DROPPED_OFF');
 assert.deepEqual((await setup.query("select operation_location from status_history where trip_student_id=$1 and to_status='DROPPED_OFF'",[assignments[0]])).rows[0].operation_location,{status:'DENIED'});
 assert.deepEqual((await setup.query('select operation_location from trip_segment_completions where trip_id=$1',[tripIds[0]])).rows[0].operation_location,{status:'DENIED'});
 assert.equal((await setup.query("select count(*)::int n from status_history where to_status='DROPPED_OFF' and operation_location=$1::jsonb",[JSON.stringify({status:'DENIED'})])).rows[0].n,7);
 assert.deepEqual((await setup.query("select operation_location from status_history where trip_student_id=$1 and to_status='PICKED_UP' limit 1",[assignments[0]])).rows[0].operation_location,gps);
 await claim(0,assignments[0]); // Undo drop-off, then undo pickup without losing membership.
 await claim(0,assignments[0],'SCHEDULED');
 await claim(1,assignments[0]);
 assert.equal((await setup.query('select count(*)::int as n from trip_students')).rows[0].n,13);
 assert.equal((await setup.query('select count(*)::int as n from status_history where trip_student_id=$1',[assignments[0]])).rows[0].n,9);
 }finally{await setup.query(`drop schema ${schema} cascade`);setup.release();await pool.end();}
});
