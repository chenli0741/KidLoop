import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import pg from 'pg';
import {saveFixedRoute,readFixedRoutes} from '../src/lib/fixed-routes';

test('draft retains route label and instructions without inventing times; incomplete draft cannot be enabled',async()=>{
 const url=process.env.KIDLOOP_TEST_DATABASE_URL;
 assert.ok(url&&['localhost','127.0.0.1'].includes(new URL(url).hostname));
 const pool=new pg.Pool({connectionString:url});const c=await pool.connect();const schema='draft_'+randomUUID().replaceAll('-','');
 try{
 await c.query(`create schema ${schema}`);await c.query(`set search_path to ${schema}`);
 for(const file of (await readdir('db/migrations')).filter(f=>f.endsWith('.sql')).sort())await c.query(await readFile('db/migrations/'+file,'utf8'));
 await c.query("insert into operating_terms(name,starts_on,ends_on) values('Term','2026-08-20','2026-12-18')");
 const school=(await c.query("insert into schools(name,address) values('School','A') returning id")).rows[0].id;
 const program=(await c.query("insert into after_school_programs(name,address) values('Program','B') returning id")).rows[0].id;
 const form=new FormData();
 for(const [k,v] of Object.entries({name:'Little Tree 1',notes:'Lina normally; Chen on early release.',startsOn:'2026-08-20',endsOn:'2026-12-18',stops:JSON.stringify([{id:randomUUID(),schoolId:school,programId:null,name:'School',address:'A',time:''},{id:randomUUID(),schoolId:null,programId:program,name:'Program',address:'B',time:''}]),students:'[]'}))form.set(k,v);
 form.append('weekdays','5');
 await c.query('begin');await saveFixedRoute(c,form);await c.query('commit');
 const [route]=await readFixedRoutes(c);
 assert.equal(route.name,'Little Tree 1');assert.equal(route.notes,'Lina normally; Chen on early release.');assert.equal(route.stops[0].time,'');assert.equal(route.enabled,false);
 form.set('id',route.id);form.set('updatedAt',route.updatedAt);form.set('enabled','on');
 await c.query('begin');await assert.rejects(saveFixedRoute(c,form));await c.query('rollback');
 assert.equal((await readFixedRoutes(c))[0].enabled,false);
 }finally{await c.query(`drop schema ${schema} cascade`);c.release();await pool.end();}
});
