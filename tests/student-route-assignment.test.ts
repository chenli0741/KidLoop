import {readTrialRange} from '../src/lib/schedule-trial-data';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';
import { assignNewStudentRoute } from '../src/lib/student-route-assignment';
import { studentRouteOptions } from '../src/lib/student-route-options';
import { readFixedRoutes, saveFixedRoute, materializeRoutes } from '../src/lib/fixed-routes';

const today = '2026-09-08';
async function fixture(run: (f: Awaited<ReturnType<typeof setup>>) => Promise<void>) {
  const url = process.env.KIDLOOP_TEST_DATABASE_URL;
  assert.ok(url && ['localhost', '127.0.0.1'].includes(new URL(url).hostname));
  const pool = new pg.Pool({ connectionString: url });
  const c = await pool.connect();
  const schema = `new_rider_${randomUUID().replaceAll('-', '')}`;
  try {
    await c.query(`create schema ${schema}`);
    await c.query(`set search_path to ${schema}`);
    for (const file of (await readdir('db/migrations')).filter(f => f.endsWith('.sql')).sort()) await c.query(await readFile(`db/migrations/${file}`, 'utf8'));
    await c.query('begin');
    await run(await setup(c));
    await c.query('commit');
  } finally {
    await c.query('rollback');
    await c.query('set search_path to public');
    await c.query(`drop schema ${schema} cascade`);
    c.release(); await pool.end();
  }
}
async function setup(c: pg.PoolClient) {
  const id = async (sql: string, params: unknown[] = []) => (await c.query(sql + ' returning id', params)).rows[0].id as string;
  await c.query("insert into operating_terms(name,starts_on,ends_on) values('Term','2026-09-01','2026-09-30')");
  const school = await id("insert into schools(name,address) values('School','School address')");
  const program = await id("insert into after_school_programs(name,address) values('Program','Program address')");
  await c.query("insert into school_terms(school_id,name,starts_on,ends_on) values($1,'Term','2026-09-01','2026-09-30')", [school]);
  await c.query("insert into school_pickup_rules(school_id,name,weekdays,grades,pickup_time) values($1,'Rule','{1,2,3,4,5}','{K,1}','14:00')", [school]);
  const student = async (days: number[] = [], destination = program, grade = '1') => {
    const result = await id("insert into students(school_id,program_id,name,photo_url,grade,no_pickup_weekdays) values($1,$2,'New student','',$3,$4)", [school, destination, grade, days]);
    await c.query('insert into term_students(operating_term_id,student_id,reviewed) values(current_operating_term(),$1,true)', [result]);
    return result;
  };
  const route = async (capacity = 2) => {
    const driver = await id("insert into drivers(name,phone) values('Driver','1')");
    const vehicle = await id("insert into vehicles(name,plate,capacity) values('Vehicle',$1,$2)", [randomUUID(), capacity]);
    const seed = await student();
    const stops = [
      { id: randomUUID(), schoolId: school, programId: null, name: '', address: '', time: '14:00' },
      { id: randomUUID(), schoolId: null, programId: program, name: '', address: '', time: '14:30' },
    ];
    const f = new FormData();
    for (const [key, value] of Object.entries({ startsOn: '2026-09-01', endsOn: '2026-09-30', driverId: driver, vehicleId: vehicle, enabled: 'on', stops: JSON.stringify(stops), students: JSON.stringify([{ studentId: seed, pickupStopId: stops[0].id, dropoffStopId: stops[1].id }]) })) f.set(key, value);
    for (const day of [1,2,3,4,5]) f.append('weekdays', String(day));
    await saveFixedRoute(c, f);
    return (await readFixedRoutes(c)).find(r => r.driverId === driver)!;
  };
  const assigned = async (studentId:string) => (await readFixedRoutes(c)).filter(r=>r.students.some(a=>a.studentId===studentId)).map(r=>({route_id:r.id}));
  return { c, id, school, program, student, route, assigned };
}

test('one matching route derives new student without creating trips; generation remains idempotent', async () => fixture(async f => {
  const route = await f.route(); const student = await f.student();
  assert.equal((await assignNewStudentRoute(f.c, student, '', today)).assigned, true);
  assert.equal((await f.assigned(student))[0].route_id, route.id);
  assert.equal((await f.c.query('select count(*)::int n from trip_students where student_id=$1', [student])).rows[0].n, 0);
  await materializeRoutes(f.c,today,today);
  assert.equal((await assignNewStudentRoute(f.c, student, '', today)).assigned, true);
  assert.equal((await f.assigned(student)).length, 1);
}));

test('multiple non-shared matches are automatic and reported in the post-arrangement review', async()=>fixture(async f=>{
 const student=await f.student();assert.equal((await assignNewStudentRoute(f.c,student,'',today)).assigned,false);
 await f.route(10);await f.route(10);
 assert.equal((await assignNewStudentRoute(f.c,student,'',today)).assigned,true);
 assert.equal((await f.assigned(student)).length,2);
 const review=await readTrialRange(f.c,[today],true);assert.ok(review.days[0].issues.some(i=>i.studentId===student&&i.code==='DUPLICATE'));
}));
test('capacity issue retains automatic student matching and prevents unsafe publication',async()=>fixture(async f=>{
 await f.route(1);const student=await f.student();
 assert.equal((await assignNewStudentRoute(f.c,student,'',today)).assigned,true);
 assert.equal((await f.assigned(student)).length,1);
 const review=await readTrialRange(f.c,[today],true);assert.ok(review.days[0].issues.some(i=>i.code==='CAPACITY'));
 await materializeRoutes(f.c,today,today);assert.equal((await f.c.query('select count(*)::int n from trips')).rows[0].n,0);
}));

test('weekly exclusions apply immediately and future unstarted tasks synchronize', async () => fixture(async f => {
  const route = await f.route();
  await materializeRoutes(f.c, '2026-09-09', today);
  const student = await f.student([2,4]);
  assert.equal((await assignNewStudentRoute(f.c, student, '', today)).assigned, true);
  await materializeRoutes(f.c,today,today);
  await materializeRoutes(f.c,'2026-09-09',today);
  const days = (await f.c.query('select scheduled_date::text as date from trip_students ts join trips t on t.id=ts.trip_id where ts.student_id=$1', [student])).rows;
  assert.deepEqual(days, [{ date: '2026-09-09' }]);
  assert.equal((await f.assigned(student))[0].route_id, route.id);
}));

test('adding a student preserves started execution and joins the next unstarted day', async () => fixture(async f => {
  await f.route();
  await materializeRoutes(f.c, today, today);
  await f.c.query("update trip_students set status='PICKED_UP',picked_up_at=now()");
  const before = (await f.c.query('select * from trip_students')).rows;
  const student = await f.student();
  assert.equal((await assignNewStudentRoute(f.c, student, '', today)).assigned, true);
  assert.deepEqual((await f.c.query('select * from trip_students')).rows, before);
  await materializeRoutes(f.c, '2026-09-09', today);
  assert.equal((await f.c.query('select count(*)::int n from trip_students where student_id=$1', [student])).rows[0].n, 1);
}));

test('stale or mismatched choices cannot assign to an unrelated route; invalid grade leaves pending', async () => fixture(async f => {
  const route = await f.route();
  const otherProgram = await f.id("insert into after_school_programs(name,address) values('Other','Other address')");
  const student = await f.student([], otherProgram);
  assert.equal((await assignNewStudentRoute(f.c, student, studentRouteOptions([route], today)[0].key, today)).assigned, false);
  assert.equal((await f.assigned(student)).length, 0);
  const invalidGrade = await f.student([], f.program, '7');
  assert.equal((await assignNewStudentRoute(f.c, invalidGrade, '', today)).assigned, false);
}));

test('candidate list excludes disabled, temporary, expired, reversed and wrong-school stop pairs', async () => fixture(async f => {
  const route = await f.route();
  assert.equal(studentRouteOptions([route], today).length, 1);
  for (const changed of [{ ...route, enabled: false }, { ...route, routeType: 'TEMPORARY' as const }, { ...route, endsOn: '2026-09-07' }, { ...route, stops: [...route.stops].reverse() }]) assert.equal(studentRouteOptions([changed], today).length, 0);
  const repeated = { ...route, stops: [route.stops[0], { ...route.stops[0], id: randomUUID() }, route.stops[1]] };
  assert.equal(studentRouteOptions([repeated], today).length, 2);
}));
