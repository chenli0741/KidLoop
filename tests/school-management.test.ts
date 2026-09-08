import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';
import { schoolNames, updateSchoolNames } from '../src/lib/school-management';

function form(values: Record<string,string>) {
  const f = new FormData();
  for (const [k,v] of Object.entries(values)) f.set(k,v);
  return f;
}
test('school names validate lengths and allow full-name fallback', () => {
  assert.deepEqual(schoolNames(form({name:' Ellis Elementary School ',shortName:' Ellis '})), {name:'Ellis Elementary School',shortName:'Ellis'});
  assert.equal(schoolNames(form({name:'School',shortName:' '})).shortName,null);
  assert.throws(()=>schoolNames(form({name:' '})));
  assert.throws(()=>schoolNames(form({name:'School',shortName:'x'.repeat(81)})));
});
test('school rename updates current route labels, preserves identity, and rejects stale forms', async () => {
  const url = process.env.KIDLOOP_TEST_DATABASE_URL!;
  assert.ok(url && ['localhost','127.0.0.1'].includes(new URL(url).hostname));
  const pool = new pg.Pool({connectionString:url});
  const c = await pool.connect();
  const schema = `schools_${randomUUID().replaceAll('-','')}`;
  try {
    await c.query(`create schema ${schema}`);
    await c.query(`set search_path to ${schema}`);
    for (const file of (await readdir('db/migrations')).filter(f=>f.endsWith('.sql')).sort()) await c.query(await readFile(`db/migrations/${file}`,'utf8'));
    await c.query("insert into operating_terms(name,starts_on,ends_on) values('Fall','2026-08-20','2026-12-20')");
    const school = (await c.query("insert into schools(name,address) values('Old School','Existing address') returning id,updated_at::text")).rows[0];
    const route = (await c.query("insert into fixed_routes(name,starts_on,ends_on,weekdays) values('Old School','2026-08-20','2026-12-20','{1}') returning id")).rows[0];
    await c.query("insert into fixed_route_stops(id,route_id,position,school_id,name,address,arrival_time) values($1,$2,0,$3,'Old School','Existing address','14:00')",[randomUUID(),route.id,school.id]);
    const f=form({id:school.id,updatedAt:school.updated_at,name:'Eaton Elementary School',shortName:'Eaton'});
    await c.query('begin');
    await updateSchoolNames(c,f);
    await c.query('commit');
    assert.deepEqual((await c.query('select id,name,short_name,address from schools where id=$1',[school.id])).rows[0],{id:school.id,name:'Eaton Elementary School',short_name:'Eaton',address:'Existing address'});
    assert.equal((await c.query('select name from fixed_route_stops where route_id=$1',[route.id])).rows[0].name,'Eaton');
    assert.equal((await c.query('select name from fixed_routes where id=$1',[route.id])).rows[0].name,'Eaton');
    await assert.rejects(updateSchoolNames(c,f),/Refresh/);
    const version=(await c.query('select updated_at::text from schools where id=$1',[school.id])).rows[0].updated_at;
    await updateSchoolNames(c,form({id:school.id,updatedAt:version,name:'Eaton Elementary School',shortName:''}));
    assert.equal((await c.query('select coalesce(short_name,name) as name from schools where id=$1',[school.id])).rows[0].name,'Eaton Elementary School');
  } finally {
    await c.query('rollback');
    await c.query('set search_path to public');
    await c.query(`drop schema ${schema} cascade`);
    c.release();await pool.end();
  }
});
