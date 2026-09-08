import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readdir,readFile} from 'node:fs/promises';
import pg from 'pg';
import {noPickupWeekdays} from '../src/lib/student-schedule';
import {saveStudent} from '../src/lib/student-management';

test('weekly exclusions validate and deduplicate weekday values',()=>{
 const form=new FormData();for(const d of ['4','2','2'])form.append('noPickupWeekdays',d);
 assert.deepEqual(noPickupWeekdays(form),[2,4]);
 form.append('noPickupWeekdays','8');assert.throws(()=>noPickupWeekdays(form));
 assert.deepEqual(noPickupWeekdays(new FormData()),[]);
});

test('migration preserves class text and student edits need no classroom object',async()=>{
 const url=process.env.KIDLOOP_TEST_DATABASE_URL!;assert.ok(['localhost','127.0.0.1'].includes(new URL(url).hostname));
 const pool=new pg.Pool({connectionString:url}),c=await pool.connect(),schema=`student_schedule_${randomUUID().replaceAll('-','')}`;
 try{
  await c.query(`create schema ${schema}`);await c.query(`set search_path to ${schema}`);
  const migrations=(await readdir('db/migrations')).filter(f=>f.endsWith('.sql')).sort();
  for(const file of migrations.filter(f=>!f.startsWith('019_')))await c.query(await readFile(`db/migrations/${file}`,'utf8'));
  const school=(await c.query("insert into schools(name,address) values('School','Address') returning id")).rows[0].id;
  const cl=(await c.query("insert into classrooms(school_id,name) values($1,'B102') returning id",[school])).rows[0].id;
  const program=(await c.query("insert into after_school_programs(name,address) values('Program','Address') returning id")).rows[0].id;
  const student=(await c.query("insert into students(classroom_id,program_id,name,photo_url,grade) values($1,$2,'Child','','3') returning id",[cl,program])).rows[0].id;
  await c.query(await readFile('db/migrations/019_student_school_and_weekly_schedule.sql','utf8'));
  const before=(await c.query('select * from students where id=$1',[student])).rows[0];
  assert.equal(before.school_id,school);assert.equal(before.classroom_name,'B102');
  const form=new FormData();
  for(const [key,value] of Object.entries({id:student,updatedAt:before.updated_at.toISOString(),name:'Child',schoolId:school,classroomName:'Room 7',programId:program,grade:'3',age:'',notes:'',photoUrl:'',parentName:'',relationship:'',parentPhone:'',backupPhone:'',email:''}))form.set(key,value as string);
  // Use the full PostgreSQL timestamp so the optimistic edit version stays exact.
  form.set('updatedAt',(await c.query('select updated_at::text as version from students where id=$1',[student])).rows[0].version);
  form.append('noPickupWeekdays','2');form.append('noPickupWeekdays','4');
  await c.query('begin');await saveStudent(c,form);await c.query('commit');
  const after=(await c.query('select * from students where id=$1',[student])).rows[0];
  assert.equal(after.classroom_id,null);assert.equal(after.classroom_name,'Room 7');assert.deepEqual(after.no_pickup_weekdays,[2,4]);
  assert.equal((await c.query('select count(*)::int n from classrooms')).rows[0].n,1);
  await c.query("insert into students(school_id,classroom_name,program_id,name,photo_url,grade) values($1,'',$2,'New child','','3')",[school,program]);
 }finally{await c.query('rollback');await c.query(`drop schema ${schema} cascade`);c.release();await pool.end();}
});
