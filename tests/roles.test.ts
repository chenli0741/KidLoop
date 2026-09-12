import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { readFile, readdir } from "node:fs/promises";
import { hashPassword, verifyPassword, tokenHash } from "../src/lib/password";
import { completedRideDay, saveDayPlan, validServiceDate } from "../src/lib/day-plans";
import type { AuthUser } from "../src/lib/types";
import { todayInOperationsTimeZone } from "../src/lib/date";

test("passwords use distinct salts and reject incorrect or oversized input", async () => {
  const password = "role-test-password-123";
  const [a, b] = await Promise.all([hashPassword(password), hashPassword(password)]);
  assert.notEqual(a, b);
  assert.equal(await verifyPassword(password, a), true);
  assert.equal(await verifyPassword("wrong-password", a), false);
  assert.equal(await verifyPassword("x".repeat(129), a), false);
  assert.equal(await verifyPassword(password, "broken"), false);
  assert.equal(tokenHash("example").length, 64);
});

test("service date validates actual calendar dates", () => {
  assert.equal(validServiceDate("2026-02-30"), false);
  assert.equal(validServiceDate("2028-02-29"), true);
  assert.equal(validServiceDate("2026-13-01"), false);
});

test("completed ride days no longer offer parent absence controls", () => {
  assert.equal(completedRideDay([]), false);
  assert.equal(completedRideDay([{ status: "SCHEDULED", droppedOffAt: null }]), false);
  assert.equal(completedRideDay([{ status: "DROPPED_OFF", droppedOffAt: "2026-09-11T22:00:00Z" }]), true);
  assert.equal(completedRideDay([{ status: "DROPPED_OFF" }, { status: "PICKED_UP" }]), false);
});

test("parent plans enforce ownership, preserve execution facts and audit changes", async () => {
  // Explicit local test DB only; never fall back to DATABASE_URL.
  const url = process.env.KIDLOOP_TEST_DATABASE_URL;
  assert.ok(url, "Set KIDLOOP_TEST_DATABASE_URL to a local test database");
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(url).hostname));
  const pool = new pg.Pool({ connectionString: url });
  const client = await pool.connect();
  const schema = `test_roles_${randomUUID().replaceAll("-", "")}`;
  try {
    await client.query(`create schema ${schema}`);
    await client.query(`set search_path to ${schema}`);
    for (const name of (await readdir("db/migrations")).filter((n) => n.endsWith(".sql")).sort()) await client.query(await readFile(`db/migrations/${name}`, "utf8"));
    const school = (await client.query("insert into schools(name,address,dismissal_time) values('Test school','Test address','14:00') returning id")).rows[0].id;
    const program = (await client.query("insert into after_school_programs(name,address) values('Test program','Test address') returning id")).rows[0].id;
    const classroom = (await client.query("insert into classrooms(school_id,name) values($1,'Test class') returning id", [school])).rows[0].id;
    const child = (await client.query("insert into students(classroom_id,program_id,name,photo_url,grade) values($1,$2,'Linked child','','1') returning id", [classroom, program])).rows[0].id;
    const other = (await client.query("insert into students(classroom_id,program_id,name,photo_url,grade) values($1,$2,'Other child','','1') returning id", [classroom, program])).rows[0].id;
    const user = (await client.query("insert into app_users(name,email,role,password_hash) values('Parent','parent@test.invalid','PARENT','test') returning id")).rows[0].id;
    const actor: AuthUser = { id: user, name: "Parent", email: "parent@test.invalid", role: "PARENT", driverId: null };
    await client.query("insert into user_students(user_id,student_id) values($1,$2)", [user, child]);
    const date = todayInOperationsTimeZone();
    await client.query("insert into operating_terms(name,starts_on,ends_on) values('Term',$1::date-1,$1::date+100)",[date]);
    await client.query('insert into term_students(operating_term_id,student_id,reviewed) select current_operating_term(),id,true from students');
    const input = { studentId: child, date, absent: true, note: "Please contact grandma" };
    const mutate = async (args = input, identity = actor) => {
      await client.query("begin");
      try { await saveDayPlan(client, identity, args); await client.query("commit"); }
      catch (error) { await client.query("rollback"); throw error; }
    };
    await assert.rejects(mutate({ ...input, studentId: other }), /FORBIDDEN/);
    await assert.rejects(mutate(input, { ...actor, role: "DRIVER" }), /FORBIDDEN/);
    await assert.rejects(mutate({ ...input, date: "2020-01-01" }), /INVALID_DATE/);
    await assert.rejects(mutate({ ...input, note: "x".repeat(1001) }), /NOTE_TOO_LONG/);
    await mutate(); // Absence before any trip exists.
    assert.equal((await client.query("select absent from student_day_plans where student_id=$1", [child])).rows[0].absent, true);
    const driver = (await client.query("insert into drivers(name,phone) values('Driver','') returning id")).rows[0].id;
    const vehicle = (await client.query("insert into vehicles(name,plate,capacity) values('Van','TEST',8) returning id")).rows[0].id;
    const shift = (await client.query("insert into driver_shifts(driver_id,vehicle_id,shift_date,start_time,end_time) values($1,$2,$3,'13:00','17:00') returning id", [driver, vehicle, date])).rows[0].id;
    const trip = (await client.query("insert into trips(shift_id,school_id,program_id,scheduled_date,departure_time) values($1,$2,$3,$4,'14:00') returning id", [shift, school, program, date])).rows[0].id;
    const rider = (await client.query("insert into trip_students(trip_id,student_id) values($1,$2) returning id", [trip, child])).rows[0].id;
    await mutate();
    const row = async () => (await client.query("select status,parent_absence from trip_students where id=$1", [rider])).rows[0];
    assert.deepEqual(await row(), { status: "ABSENT", parent_absence: true });
    assert.equal((await client.query("select status from trips where id=$1", [trip])).rows[0].status, "COMPLETED");
    await mutate({ ...input, absent: false });
    assert.deepEqual(await row(), { status: "SCHEDULED", parent_absence: false });
    assert.equal((await client.query("select status from trips where id=$1", [trip])).rows[0].status, "PUBLISHED");
    await client.query("update trip_students set status='ABSENT',parent_absence=false where id=$1", [rider]);
    await mutate({ ...input, absent: false });
    assert.deepEqual(await row(), { status: "ABSENT", parent_absence: false });
    await client.query("update trip_students set status='EXCEPTION',picked_up_at=now() where id=$1", [rider]);
    await assert.rejects(mutate(), /ALREADY_PICKED_UP/);
    await mutate({ ...input, absent: false, note: "Please call on arrival" });
    assert.equal((await row()).status, "EXCEPTION");
    assert.equal((await client.query("select count(*)::int as n from status_history where actor_id=$1", [user])).rows[0].n, 2);
    assert.equal((await client.query("select count(*)::int as n from student_day_plan_history where actor_id=$1", [user])).rows[0].n, 5);
  } finally {
    await client.query("rollback");
    await client.query("set search_path to public");
    await client.query(`drop schema ${schema} cascade`);
    client.release(); await pool.end();
  }
});
