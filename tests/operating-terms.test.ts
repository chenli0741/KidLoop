import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import pg from "pg";
import {
  createOperatingTerm,
  initializeSchools,
  archiveOperatingTerm,
  openTerm,
  requireTerm,
  reviewTermStudent,
} from "../src/lib/operating-terms";
import { federalHolidays } from "../src/lib/federal-holidays";
import { savePickupSetting } from "../src/lib/pickup-settings";
import {
  readFixedRoutes,
  readRouteTaskIssues,
  saveFixedRoute,
  materializeRoutes,
} from "../src/lib/fixed-routes";
const form = (v: Record<string, string>) => {
  const f = new FormData();
  for (const [k, x] of Object.entries(v)) f.set(k, x);
  return f;
};
test("federal holiday dates use the new year including observed cross-year dates", () => {
  const dates = federalHolidays("2026-01-01", "2026-12-31").map((h) => h.date);
  for (const d of [
    "2026-05-25",
    "2026-07-03",
    "2026-07-04",
    "2026-09-07",
    "2026-11-26",
  ])
    assert.ok(dates.includes(d), d);
  assert.match(federalHolidays("2027-12-31", "2027-12-31")[0].name, /New Year/);
  assert.deepEqual(federalHolidays("2026-09-08", "2026-09-09"), []);
});
test("operating term initializes once, archives frozen data and copies only reviewable plans", async () => {
  const url = process.env.KIDLOOP_TEST_DATABASE_URL;
  assert.ok(url && ["localhost", "127.0.0.1"].includes(new URL(url).hostname));
  const pool = new pg.Pool({ connectionString: url }),
    c = await pool.connect(),
    schema = `term_test_${randomUUID().replaceAll("-", "")}`;
  const id = async (sql: string, args: unknown[] = []) =>
    (await c.query(sql + " returning id", args)).rows[0].id as string;
  const tx = async <T>(fn: () => Promise<T>): Promise<T> => {
    await c.query("begin");
    try {
      const result = await fn();
      await c.query("commit");
      return result;
    } catch (e) {
      await c.query("rollback");
      throw e;
    }
  };
  try {
    await c.query(`create schema ${schema}`);
    await c.query(`set search_path to ${schema}`);
    for (const f of (await readdir("db/migrations"))
      .filter((f) => f.endsWith(".sql"))
      .sort())
      await c.query(await readFile(`db/migrations/${f}`, "utf8"));
    const school = await id(
        "insert into schools(name,address) values('School A','A')",
      ),
      other = await id(
        "insert into schools(name,address) values('School B','B')",
      );
    const cl = await id(
      "insert into classrooms(school_id,name) values($1,'Class A')",
      [school],
    );
    const program = await id(
      "insert into after_school_programs(name,address) values('Program','P')",
    );
    const student = await id(
      "insert into students(name,photo_url,grade,classroom_id,program_id) values('Child','','1',$1,$2)",
      [cl, program],
    );
    const old = await tx(() =>
      createOperatingTerm(
        c,
        form({
          name: "Fall 2026",
          startsOn: "2026-08-20",
          endsOn: "2026-12-20",
        }),
      ),
    );
    await assert.rejects(
      tx(() =>
        createOperatingTerm(
          c,
          form({
            name: "Duplicate",
            startsOn: "2027-01-01",
            endsOn: "2027-06-01",
          }),
        ),
      ),
      /Archive the current/,
    );
    assert.equal(
      (await c.query("select count(*)::int n from school_terms")).rows[0].n,
      2,
    );
    const version = async (table: string, key: string) =>
      (
        await c.query(`select updated_at::text v from ${table} where id=$1`, [
          key,
        ])
      ).rows[0].v;
    const schoolTerm = (
      await c.query("select id from school_terms where school_id=$1", [school])
    ).rows[0].id;
    const change = {
      kind: "term",
      schoolId: school,
      id: schoolTerm,
      updatedAt: await version("school_terms", schoolTerm),
      name: "Fall",
      startsOn: "2026-08-27",
      endsOn: "2026-12-20",
    };
    await tx(() => savePickupSetting(c, form(change)));
    await assert.rejects(
      tx(() => savePickupSetting(c, form({ ...change, id: "" }))),
      /only be edited/,
    );
    await assert.rejects(
      tx(() => savePickupSetting(c, form({ ...change, remove: "1" }))),
      /only be edited/,
    );
    await c.query(
      "delete from school_calendar_exceptions where school_id=$1 and starts_on='2026-09-07'",
      [school],
    );
    await tx(() => initializeSchools(c, old));
    assert.equal(
      (
        await c.query(
          "select count(*)::int n from school_calendar_exceptions where school_id=$1 and starts_on='2026-09-07'",
          [school],
        )
      ).rows[0].n,
      0,
    );
    assert.equal(
      (
        await c.query(
          "select count(*)::int n from school_calendar_exceptions where school_id=$1 and starts_on='2026-09-07'",
          [other],
        )
      ).rows[0].n,
      1,
    );
    assert.equal(
      (
        await c.query(
          "select starts_on::text d from school_terms where id=$1",
          [schoolTerm],
        )
      ).rows[0].d,
      "2026-08-27",
    );
    const rule = form({
      kind: "rule",
      schoolId: school,
      name: "Grades 1–3",
      pickupTime: "14:30",
    });
    for (const g of ["1", "2", "3"]) rule.append("grades", g);
    for (const d of ["1", "2", "3", "4", "5"]) rule.append("weekdays", d);
    await tx(() => savePickupSetting(c, rule));
    await tx(() =>
      savePickupSetting(
        c,
        form({
          kind: "exception",
          schoolId: school,
          name: "Teacher week",
          startsOn: "2026-10-19",
          endsOn: "2026-10-23",
          exceptionType: "time",
          pickupTime: "12:30",
        }),
      ),
    );
    await tx(() =>
      reviewTermStudent(
        c,
        form({
          operatingTermId: old.id,
          studentId: student,
          grade: "1",
          classroomId: cl,
          programId: program,
        }),
      ),
    );
    const route = await id(
      "insert into fixed_routes(name,starts_on,ends_on,weekdays,enabled) values('School A → Program','2026-08-20','2026-12-20',array[1,2,3,4,5],false)",
    );
    const stop1 = await id(
      "insert into fixed_route_stops(id,route_id,position,school_id,name,address,arrival_time) values(gen_random_uuid(),$1,0,$2,'School A','A','14:30')",
      [route, school],
    );
    const stop2 = await id(
      "insert into fixed_route_stops(id,route_id,position,program_id,name,address,arrival_time) values(gen_random_uuid(),$1,1,$2,'Program','P','15:00')",
      [route, program],
    );
    await c.query("insert into fixed_route_students values($1,$2,$3,$4)", [
      route,
      student,
      stop1,
      stop2,
    ]);
    await assert.rejects(
      tx(() => archiveOperatingTerm(c, old.id, "2026-12-20")),
      /Archive after/,
    );
    await tx(() => archiveOperatingTerm(c, old.id, "2026-12-21"));
    assert.equal(await openTerm(c), undefined);
    assert.deepEqual(await readFixedRoutes(c), []);
    await tx(() => materializeRoutes(c, "2026-10-20", "2026-10-20"));
    assert.equal(
      (await c.query("select count(*)::int n from trips")).rows[0].n,
      0,
    );
    const snapshot = (
      await c.query("select snapshot from operating_terms where id=$1", [
        old.id,
      ])
    ).rows[0].snapshot;
    assert.equal(snapshot.students[0].grade, "1");
    assert.equal(snapshot.school_pickup_rules.length, 1);
    await c.query("update students set grade='5' where id=$1", [student]);
    const next = await tx(() =>
      createOperatingTerm(
        c,
        form({
          name: "Spring 2027",
          startsOn: "2027-01-01",
          endsOn: "2027-06-20",
          source: old.id,
        }),
      ),
    );
    assert.notEqual(next.id, old.id);
    assert.equal(
      (
        await c.query(
          "select previous_grade from term_students where operating_term_id=$1",
          [next.id],
        )
      ).rows[0].previous_grade,
      "1",
    );
    assert.equal(
      (
        await c.query(
          "select count(*)::int n from school_calendar_exceptions where operating_term_id=$1 and name='Teacher week'",
          [next.id],
        )
      ).rows[0].n,
      0,
    );
    assert.equal(
      (
        await c.query(
          "select count(*)::int n from school_pickup_rules where operating_term_id=$1",
          [next.id],
        )
      ).rows[0].n,
      1,
    );
    const copied = (await readFixedRoutes(c))[0];
    assert.equal(copied.enabled, false);
    assert.equal(copied.startsOn, "2027-01-01");
    assert.equal(copied.driverId, null);
    assert.equal(copied.students.length, 1);
    const driver = await id(
        "insert into drivers(name,phone) values('Driver','')",
      ),
      vehicle = await id(
        "insert into vehicles(name,plate,capacity) values('Van','V1',8)",
      );
    const rf = form({
      id: copied.id,
      updatedAt: copied.updatedAt,
      name: copied.name,
      startsOn: next.startsOn,
      endsOn: next.endsOn,
      driverId: driver,
      vehicleId: vehicle,
      enabled: "on",
      stops: JSON.stringify(copied.stops),
      students: JSON.stringify(copied.students),
    });
    for (const d of copied.weekdays) rf.append("weekdays", String(d));
    await assert.rejects(
      tx(() => saveFixedRoute(c, rf)),
      /Review this term/,
    );
    await tx(() =>
      reviewTermStudent(
        c,
        form({
          operatingTermId: next.id,
          studentId: student,
          grade: "2",
          classroomId: cl,
          programId: program,
        }),
      ),
    );
    await tx(() => saveFixedRoute(c, rf));
    await tx(() => materializeRoutes(c, "2027-01-05", "2027-01-05"));
    assert.equal(
      (
        await c.query(
          "select count(*)::int n from trips where operating_term_id=$1",
          [next.id],
        )
      ).rows[0].n,
      1,
    );
    assert.deepEqual(
      (
        await c.query("select snapshot from operating_terms where id=$1", [
          old.id,
        ])
      ).rows[0].snapshot,
      snapshot,
    );
    await assert.rejects(
      tx(() => requireTerm(c, old.id)),
      /Working term changed/,
    );
    await assert.rejects(
      tx(async () =>
        savePickupSetting(
          c,
          form({
            ...change,
            updatedAt: await version("school_terms", schoolTerm),
          }),
        ),
      ),
      /Refresh|school|belong|found/,
    );
    await c.query("insert into route_task_issues values($1,'2027-01-05','Test notice')",[copied.id]);
    assert.equal((await readRouteTaskIssues(c,'2027-01-05')).length,1);
    await tx(() => archiveOperatingTerm(c, next.id, "2027-06-21"));
    assert.equal(await openTerm(c), undefined);
    assert.deepEqual(await readFixedRoutes(c), []);
    assert.equal(
      (
        await c.query("select snapshot from operating_terms where id=$1", [
          next.id,
        ])
      ).rows[0].snapshot.trips[0].status,
      "PUBLISHED",
    );
    assert.deepEqual(await readRouteTaskIssues(c,'2027-01-05'),[]);
    const archived=(await c.query('select snapshot from operating_terms where id=$1',[next.id])).rows[0].snapshot;
    assert.equal(archived.shifts[0].driver_id,driver);
    assert.equal(archived.shifts[0].vehicle_id,vehicle);
    assert.equal(archived.shifts[0].id,archived.trips[0].shift_id);
    assert.equal(archived.route_issues[0].message,'Test notice');
    await c.query("update drivers set name='Renamed' where id=$1",[driver]);
    assert.deepEqual((await c.query('select snapshot from operating_terms where id=$1',[next.id])).rows[0].snapshot,archived);
  } finally {
    await c.query(`drop schema if exists ${schema} cascade`);
    c.release();
    await pool.end();
  }
});
