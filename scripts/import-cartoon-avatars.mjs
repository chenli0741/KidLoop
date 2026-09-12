import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import pg from 'pg';
import sharp from 'sharp';
import {put,get} from '@vercel/blob';

const directory=process.argv.find((x,i)=>i>1&&!x.startsWith('--'));
const originals=process.argv.includes('--originals');
const apply=process.argv.includes('--apply');
if(!directory)throw new Error('Usage: node --env-file=.env.local scripts/import-cartoon-avatars.mjs <private batch directory> [--apply]');
const records=JSON.parse(await fs.readFile(path.join(directory,'manifest.json'),'utf8'));
if(!records.length||new Set(records.map(r=>r.id)).size!==records.length)throw new Error('Invalid manifest');
const u=new URL(process.env.DATABASE_URL);if(u.searchParams.get('sslmode')==='require')u.searchParams.set('sslmode','verify-full');
const pool=new pg.Pool({connectionString:u.toString()});
const client=await pool.connect();
const hashes=new Set();
try {
 const current=(await client.query(`select id,photo_url from students where coalesce(photo_url,'')${originals?'=':'<>'}'' order by id`)).rows;
 if(current.length!==records.length||current.some((r,i)=>r.id!==records[i].id||r.photo_url!==records[i].photo_url))throw new Error('Roster photos changed; re-export before applying');
 for(const [i,r] of records.entries()){
  r.png=await fs.readFile(path.join(directory,`${String(i+1).padStart(2,'0')}-avatar.png`));
  const m=await sharp(r.png).metadata(),stats=await sharp(r.png).stats();
  if(m.format!=='png'||m.width!==512||m.height!==512||!m.hasAlpha||stats.channels[3].min!==0||stats.channels[3].max!==255)throw new Error(`Invalid transparent PNG ${i+1}`);
  const hash=createHash('sha256').update(r.png).digest('hex');if(hashes.has(hash))throw new Error(`Duplicate avatar ${i+1}`);hashes.add(hash);
 }
 console.log(JSON.stringify({mode:apply?'apply':'dry-run',students:records.length,uniqueTransparentAvatars:hashes.size,originalPhotos:'preserved'}));
 if(!apply)process.exitCode=0;
 else {
  const uploadedFile=path.join(directory,'uploaded.json');
  let uploaded=[];try{uploaded=JSON.parse(await fs.readFile(uploadedFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  for(const [i,r] of records.entries()){
   const hash=createHash('sha256').update(r.png).digest('hex');
   let asset=uploaded.find(a=>a.studentId===r.id&&a.sha256===hash);
   if(!asset){const b=await put(`student-cartoons/${randomUUID()}.png`,r.png,{access:'private',contentType:'image/png',addRandomSuffix:false});asset={studentId:r.id,sha256:hash,url:b.url};uploaded.push(asset);await fs.writeFile(uploadedFile,JSON.stringify(uploaded,null,2),{mode:0o600});}
   const b=await get(asset.url,{access:'private'});if(!b||b.statusCode!==200)throw new Error(`Upload not readable ${i+1}`);
   const bytes=Buffer.from(await new Response(b.stream).arrayBuffer());if(createHash('sha256').update(bytes).digest('hex')!==hash)throw new Error(`Upload mismatch ${i+1}`);
   r.cartoonUrl=asset.url;
  }
  await client.query('begin');
  await client.query("select pg_advisory_xact_lock(hashtext('kidloop-cartoon-avatars'))");
  const locked=(await client.query('select id,photo_url from students where id=any($1::uuid[]) order by id for update',[records.map(r=>r.id)])).rows;
  if(locked.length!==records.length||locked.some((r,i)=>r.id!==records[i].id||r.photo_url!==records[i].photo_url))throw new Error('Source changed during upload');
  const before=(await client.query('select * from student_cartoon_avatars where student_id=any($1::uuid[])',[records.map(r=>r.id)])).rows;
  await fs.writeFile(path.join(directory,`avatar-associations-before-${Date.now()}.json`),JSON.stringify(before,null,2),{mode:0o600});
  for(const r of records)await client.query(`insert into student_cartoon_avatars(student_id,source_photo_url,blob_url,style_version)
   values($1,$2,$3,$4) on conflict(student_id) do update set source_photo_url=excluded.source_photo_url,blob_url=excluded.blob_url,style_version=excluded.style_version,created_at=now()`,[r.id,r.photo_url??'',r.cartoonUrl,originals?'comic-original-v1':'comic-varied-v1']);
  const verified=(await client.query('select s.id,s.photo_url,ca.source_photo_url,ca.blob_url from students s join student_cartoon_avatars ca on ca.student_id=s.id where s.id=any($1::uuid[]) order by s.id',[records.map(r=>r.id)])).rows;
  if(verified.length!==records.length||verified.some((r,i)=>r.photo_url!==records[i].photo_url||r.source_photo_url!==r.photo_url||r.blob_url!==records[i].cartoonUrl))throw new Error('Association verification failed');
  await client.query('commit');
  const check=await client.query('select count(*)::int as avatars from student_cartoon_avatars ca join students s on s.id=ca.student_id and s.photo_url=ca.source_photo_url');
  console.log(JSON.stringify({applied:records.length,verified:check.rows[0].avatars,originalPhotosUnchanged:true}));
 }
} catch(e){await client.query('rollback');throw e;}finally{client.release();await pool.end();}
