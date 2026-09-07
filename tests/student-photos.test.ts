import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import pg from 'pg';
import {normalizePhoto,attachPhoto,photoAccessSql} from '../src/lib/student-photos';
test('photo processing bounds dimensions, strips metadata and rejects invalid input',async()=>{
 const input=await sharp({create:{width:2000,height:1600,channels:3,background:'red'}}).jpeg().withMetadata().toBuffer();
 const output=await normalizePhoto(input), m=await sharp(output).metadata();
 assert.equal(m.format,'jpeg');assert.equal(m.width,1024);assert.equal(m.exif,undefined);
 await assert.rejects(normalizePhoto(Buffer.from('not an image')));
 await assert.rejects(normalizePhoto(Buffer.alloc(1024*1024+1)));
});
test('uploads require their owner to attach and only linked families or assigned drivers can read',async()=>{
 const url=process.env.KIDLOOP_TEST_DATABASE_URL;assert.ok(url&&['localhost','127.0.0.1'].includes(new URL(url).hostname));
 const p=new pg.Pool({connectionString:url}),c=await p.connect(),schema='photos_'+randomUUID().replaceAll('-','');
 const id=async(s:string,v:unknown[]=[]) => (await c.query(s+' returning id',v)).rows[0].id;
 try{
 await c.query(`create schema ${schema}`);await c.query(`set search_path to ${schema}`);
 for(const f of (await readdir('db/migrations')).filter(f=>f.endsWith('.sql')).sort())await c.query(await readFile('db/migrations/'+f,'utf8'));
 const school=await id("insert into schools(name,address) values('S','A')"), cls=await id("insert into classrooms(school_id,name) values($1,'C')",[school]), program=await id("insert into after_school_programs(name,address) values('P','A')");
 const child=await id("insert into students(classroom_id,program_id,name,photo_url,grade) values($1,$2,'Child','','1')",[cls,program]);
 const owner=await id("insert into app_users(name,email,password_hash,role) values('Parent','a@test','x','PARENT')"),other=await id("insert into app_users(name,email,password_hash,role) values('Other','b@test','x','PARENT')");
 const photo=randomUUID(),path='/api/photos/'+photo;
 await c.query("insert into student_photos(id,uploaded_by,blob_url) values($1,$2,'private-url')",[photo,owner]);
 const access=async(user:string,role='PARENT')=>(await c.query(photoAccessSql,[photo,user,role,null])).rowCount;
 assert.equal(await access(owner),1);assert.equal(await access(other),0);
 await assert.rejects(attachPhoto(c,path,child,other));await attachPhoto(c,path,child,owner);
 await c.query('update students set photo_url=$2 where id=$1',[child,path]);
 assert.equal(await access(owner),0);await c.query('insert into user_students(user_id,student_id) values($1,$2)',[owner,child]);
 assert.equal(await access(owner),1);assert.equal(await access(other),0);assert.equal(await access(other,'DRIVER'),0);assert.equal(await access(other,'ADMIN'),1);
 await c.query("update students set photo_url='' where id=$1",[child]);assert.equal(await access(owner),0);
 }finally{await c.query(`drop schema ${schema} cascade`);c.release();await p.end();}
});
