import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import pg from 'pg';
import {cartoonAvatarAccessSql} from '../src/lib/student-cartoon-avatars';

test('cartoons require student access and invalidate when the original changes',async()=>{
 const url=process.env.KIDLOOP_TEST_DATABASE_URL;
 assert.ok(url&&['localhost','127.0.0.1'].includes(new URL(url).hostname));
 const p=new pg.Pool({connectionString:url}),c=await p.connect(),schema='cartoons_'+randomUUID().replaceAll('-','');
 const id=async(sql:string,args:unknown[]=[]) => (await c.query(sql+' returning id',args)).rows[0].id;
 try {
  await c.query(`create schema ${schema}`);await c.query(`set search_path to ${schema}`);
  // 047 applies a specific production school's supplied calendar; it is not schema setup.
  for(const file of (await readdir('db/migrations')).filter(f=>f.endsWith('.sql')&&!f.startsWith('047_')).sort())await c.query(await readFile('db/migrations/'+file,'utf8'));
  const school=await id("insert into schools(name,address) values('S','A')");
  const cls=await id("insert into classrooms(school_id,name) values($1,'C')",[school]);
  const program=await id("insert into after_school_programs(name,address) values('P','A')");
  const child=await id("insert into students(classroom_id,program_id,name,photo_url,grade) values($1,$2,'Child','/api/photos/source','1')",[cls,program]);
  const parent=await id("insert into app_users(name,email,password_hash,role) values('Parent','p@test','x','PARENT')");
  const other=randomUUID();
  await c.query("insert into student_cartoon_avatars(student_id,source_photo_url,blob_url,style_version) values($1,'/api/photos/source','private-cartoon','v1')",[child]);
  const access=async(user:string,role='PARENT',driver:string|null=null)=>(await c.query(cartoonAvatarAccessSql,[child,user,role,driver])).rowCount;
  assert.equal(await access(parent),0);
  await c.query('insert into user_students(user_id,student_id) values($1,$2)',[parent,child]);
  assert.equal(await access(parent),1);assert.equal(await access(other),0);
  assert.equal(await access(other,'ADMIN'),1);assert.equal(await access(other,'DRIVER'),0);
  const driver=await id("insert into drivers(name,phone) values('Driver','')");
  const vehicle=await id("insert into vehicles(name,plate,capacity) values('V','V',8)");
  const shift=await id("insert into driver_shifts(driver_id,vehicle_id,shift_date,start_time,end_time) values($1,$2,current_date,'14:00','16:00')",[driver,vehicle]);
  const trip=await id("insert into trips(shift_id,school_id,program_id,scheduled_date,departure_time,status) values($1,$2,$3,current_date,'14:30','PUBLISHED')",[shift,school,program]);
  await c.query('insert into trip_students(trip_id,student_id) values($1,$2)',[trip,child]);
  assert.equal(await access(other,'DRIVER',driver),1);
  assert.equal(await access(other,'DRIVER',randomUUID()),0);
  await c.query("update trips set status='CANCELED' where id=$1",[trip]);
  assert.equal(await access(other,'DRIVER',driver),0);
  await c.query("update students set photo_url='/api/photos/replacement' where id=$1",[child]);
  assert.equal(await access(parent),0);assert.equal(await access(other,'ADMIN'),0);
  await c.query("update students set photo_url='' where id=$1",[child]);
  assert.equal(await access(parent),0);
  await c.query("update student_cartoon_avatars set source_photo_url='' where student_id=$1",[child]);
  assert.equal(await access(parent),1);assert.equal(await access(other),0);
  await c.query("update students set photo_url='/api/photos/new' where id=$1",[child]);
  assert.equal(await access(parent),0);
 } finally {await c.query(`drop schema ${schema} cascade`);c.release();await p.end();}
});
