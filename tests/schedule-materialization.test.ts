import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import pg from 'pg';
import {materializeRoutes} from '../src/lib/fixed-routes';

test('empty service days retain a completed materialization marker',async()=>{
 const url=process.env.KIDLOOP_TEST_DATABASE_URL;
 assert.ok(url&&['localhost','127.0.0.1'].includes(new URL(url).hostname));
 const pool=new pg.Pool({connectionString:url}),c=await pool.connect();
 const schema=`empty_generation_${randomUUID().replaceAll('-','')}`;
 try{
  await c.query(`create schema ${schema}`);
  await c.query(`set search_path to ${schema}`);
  for(const file of (await readdir('db/migrations')).filter(file=>file.endsWith('.sql')&&!file.startsWith('047_')).sort())
   await c.query(await readFile(`db/migrations/${file}`,'utf8'));
  await c.query("select set_config('kidloop.tenant_id','00000000-0000-4000-8000-000000000001',false)");
  await c.query("insert into operating_terms(name,starts_on,ends_on) values('Term','2026-09-01','2026-09-30')");
  const before=Number((await c.query('select revision from schedule_input_revisions')).rows[0].revision);
  await c.query("insert into drivers(name,phone) values('Driver','')");
  assert.equal(Number((await c.query('select revision from schedule_input_revisions')).rows[0].revision),before+1);
  for(let i=0;i<2;i++){
   await c.query('begin');
   try{await materializeRoutes(c,'2026-09-26','2026-09-26');await c.query('commit');}
   catch(error){await c.query('rollback');throw error;}
  }
  assert.equal((await c.query('select count(*)::int n from trips')).rows[0].n,0);
  assert.equal((await c.query("select count(*)::int n from schedule_materializations where service_date='2026-09-26'")).rows[0].n,1);
 }finally{
  await c.query('rollback');
  await c.query('set search_path to public');
  await c.query(`drop schema ${schema} cascade`);
  c.release();await pool.end();
 }
});
