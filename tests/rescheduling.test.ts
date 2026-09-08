import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import pg from "pg";
import {
  saveFixedRoute,
  readFixedRoutes,
  materializeRoutes,
} from "../src/lib/fixed-routes";
import { readSnapshot } from "../src/lib/rescheduling/snapshot";
import { calculatePlan, validateIntent } from "../src/lib/rescheduling/planner";
import { trial, applyDraft, getDraft, saveTemporary } from "../src/lib/rescheduling/service";
import { parseRequest } from "../src/lib/rescheduling/ai";
import type { Intent } from "../src/lib/rescheduling/types";

test("rescheduling: read-only trial, atomic date-limited application, retained history, refresh, stale and idempotent submissions", async () => {
  const url = process.env.KIDLOOP_TEST_DATABASE_URL;
  assert.ok(url && ["localhost", "127.0.0.1"].includes(new URL(url).hostname));
  const pool = new pg.Pool({ connectionString: url }),
    c = await pool.connect(),
    schema = `adjust_${randomUUID().replaceAll("-", "")}`;
  const id = async (sql: string, args: unknown[] = []) =>
    (await c.query(sql + " returning id", args)).rows[0].id as string;
  const tx = async <T>(fn: () => Promise<T>) => {
    await c.query("begin");
    try {
      const r = await fn();
      await c.query("commit");
      return r;
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
    const term = await id(
      "insert into operating_terms(name,starts_on,ends_on) values('Test term','2026-09-01','2026-09-30')",
    );
    const admin = await id(
      "insert into app_users(name,email,role,password_hash) values('Admin','adjust@example.test','ADMIN','no-login')",
    );
    const school = await id(
        "insert into schools(name,address) values('Test School','School Address')",
      ),
      program = await id(
        "insert into after_school_programs(name,address) values('Test Program','Program Address')",
      );
    const driver = await id(
        "insert into drivers(name,phone) values('Test Driver','1')",
      ),
      backup = await id(
        "insert into drivers(name,phone) values('Test Backup','2')",
      );
    const vehicle = await id(
        "insert into vehicles(name,plate,capacity) values('Test Van','ADJUST1',6)",
      ),
      backupVehicle = await id(
        "insert into vehicles(name,plate,capacity) values('Test Spare','ADJUST2',6)",
      );
    await c.query(
      "insert into school_terms(school_id,name,starts_on,ends_on) values($1,'Term','2026-09-01','2026-09-30')",
      [school],
    );
    await c.query(
      "insert into school_pickup_rules(school_id,name,weekdays,pickup_time,grades) values($1,'Rule',array[1,2,3,4,5],'14:00',array['K','1'])",
      [school],
    );
    const students: string[] = [];
    for (let n = 0; n < 4; n++)
      students.push(
        await id(
          "insert into students(school_id,program_id,name,grade,photo_url) values($1,$2,$3,$4,'')",
          [school, program, `Test Child ${n}`, n < 2 ? "K" : "1"],
        ),
      );
    await c.query(
      "insert into term_students(operating_term_id,student_id,reviewed) select $1,id,true from students",
      [term],
    );
    const stops = [
      {
        id: randomUUID(),
        schoolId: school,
        programId: null,
        name: "",
        address: "",
        time: "14:00",
      },
      {
        id: randomUUID(),
        schoolId: null,
        programId: program,
        name: "",
        address: "",
        time: "14:30",
      },
    ];
    const form = new FormData();
    for (const [k, v] of Object.entries({
      startsOn: "2026-09-01",
      endsOn: "2026-09-30",
      driverId: driver,
      vehicleId: vehicle,
      enabled: "on",
      stops: JSON.stringify(stops),
      students: JSON.stringify(
        students.map((studentId) => ({
          studentId,
          pickupStopId: stops[0].id,
          dropoffStopId: stops[1].id,
        })),
      ),
    }))
      form.set(k, v);
    for (const d of [1, 2, 3, 4, 5]) form.append("weekdays", String(d));
    await tx(() => saveFixedRoute(c, form));
    const original = (await readFixedRoutes(c))[0];
    const intent: Intent = {
      startsOn: "2026-09-08",
      endsOn: "2026-09-09",
      changes: [{ schoolId: school, grades: ["K"], time: "12:00" }],
      unavailableDriverIds: [],
      unavailableVehicleIds: [],
      lockedRouteIds: [],
      preferExistingDrivers: true,
      noAdditionalDrivers: true,
      question: "",
    };
    const create = () =>
      id(
        "insert into reschedule_requests(user_id,operating_term_id) values($1,$2)",
        [admin, term],
      );
    const request = await create();
    const counts = async () =>
      (
        await c.query(
          "select (select count(*) from trips) as trips,(select count(*) from fixed_routes) as routes,(select count(*) from school_calendar_exceptions) as exceptions",
        )
      ).rows[0];
    const beforeCounts = await counts();
    await tx(() => trial(c, request, admin, 0, intent, "2026-09-01"));
    assert.deepEqual(
      await counts(),
      beforeCounts,
      "trial does not materialize any formal rows",
    );
    let draft = await getDraft(c, request, admin);
    assert.equal(draft.status, "READY");
    assert.ok(draft.result!.candidates.length);
    // The split option must be available, and K must actually leave earlier rather than wait for grade 1.
    const split = draft.result!.candidates.findIndex(
      (x) => x.days[0].after.length === 2,
    );
    assert.ok(split >= 0, "split by existing grade times is searched");
    const early = draft.result!.candidates[split].days[0].after.find((p) =>
      p.students.some((s) => s.studentId === students[0]),
    )!;
    assert.equal(early.stops[0].time, "12:00");
    assert.equal(early.driverId, driver);
    // A page read after the initial preview changes the materialization snapshot, so re-trial.
    await tx(() => materializeRoutes(c, "2026-09-08", "2026-09-01"));
    await assert.rejects(
      tx(() => applyDraft(c, request, admin, 0, split, "2026-09-01")),
      /changed/,
    );
    const assignment = (
      await c.query("select id from trip_students where student_id=$1", [
        students[0],
      ])
    ).rows[0].id;
    await c.query(
      "insert into student_day_plans(student_id,service_date,absent,updated_by) values($1,'2026-09-08',true,$2)",
      [students[0], admin],
    );
    await c.query(
      "update trip_students set status='ABSENT',parent_absence=true where id=$1",
      [assignment],
    );
    await c.query(
      "insert into status_history(trip_student_id,from_status,to_status,note) values($1,'SCHEDULED','ABSENT','Test absence')",
      [assignment],
    );
    await tx(() => trial(c, request, admin, 0, intent, "2026-09-01"));
    draft = await getDraft(c, request, admin);
    const index = draft.result!.candidates.findIndex(
      (x) => x.days[0].after.length === 2,
    );
    await tx(() => applyDraft(c, request, admin, 0, index, "2026-09-01"));
    assert.equal((await getDraft(c, request, admin)).status, "APPLIED");
    const afterCounts = await counts();
    await tx(() => applyDraft(c, request, admin, 0, index, "2026-09-01"));
    assert.deepEqual(await counts(), afterCounts);
    await assert.rejects(
      tx(() =>
        applyDraft(c, request, admin, 0, index === 0 ? 1 : 0, "2026-09-01"),
      ),
      /Another version/,
    );
    const roster = async (date: string) =>
      (
        await c.query(
          `select ts.student_id,ts.id,ts.parent_absence,ts.status,to_char(t.departure_time,'HH24:MI') as time from trip_students ts join trips t on t.id=ts.trip_id where t.scheduled_date=$1 and t.status<>'CANCELED' order by ts.student_id`,
          [date],
        )
      ).rows;
    const applied = await roster("2026-09-08");
    assert.equal(applied.length, 4);
    assert.equal(
      applied.find((s) => s.student_id === students[0])!.id,
      assignment,
    );
    assert.equal(
      applied.find((s) => s.student_id === students[0])!.parent_absence,
      true,
    );
    assert.equal(
      (
        await c.query(
          "select count(*)::int n from status_history where trip_student_id=$1",
          [assignment],
        )
      ).rows[0].n,
      1,
    );
    await tx(() => materializeRoutes(c, "2026-09-08", "2026-09-01", driver));
    assert.deepEqual(await roster("2026-09-08"), applied);
    await tx(() => materializeRoutes(c, "2026-09-09", "2026-09-01", driver));
    assert.equal((await roster("2026-09-09")).length, 4);
    await tx(() => materializeRoutes(c, "2026-09-10", "2026-09-01", driver));
    assert.ok((await roster("2026-09-10")).every((r) => r.time === "14:00"));
    assert.equal(
      (
        await c.query(
          "select count(*)::int n from fixed_route_students where route_id=$1",
          [original.id],
        )
      ).rows[0].n,
      4,
    );
    // Re-adjust an already applied temporary route without losing its assignment/history.
    const repeated = await create();
    const repeatedIntent = { ...intent, endsOn: intent.startsOn, changes: [{ schoolId: school, grades: ['K'], time: '11:30' }] };
    await tx(() => trial(c, repeated, admin, 0, repeatedIntent, '2026-09-01'));
    assert.ok((await getDraft(c, repeated, admin)).result!.candidates.length);
    await tx(() => applyDraft(c, repeated, admin, 0, 0, '2026-09-01'));
    const repeatedRoster = await roster('2026-09-08');
    assert.equal(repeatedRoster.find(s => s.student_id === students[0])!.time, '11:30');
    assert.equal(repeatedRoster.find(s => s.student_id === students[0])!.id, assignment);
    assert.equal(repeatedRoster.find(s => s.student_id === students[0])!.parent_absence, true);
    await tx(() => materializeRoutes(c, '2026-09-08', '2026-09-01', driver));
    assert.deepEqual(await roster('2026-09-08'), repeatedRoster);
    assert.equal((await roster('2026-09-09')).find(s => s.student_id === students[0])!.time, '12:00');
    // A new request can reassign resources on a future date, but any subsequent student change invalidates it.
    const next = await create(),
      nextIntent = {
        ...intent,
        startsOn: "2026-09-11",
        endsOn: "2026-09-11",
        changes: [],
        unavailableDriverIds: [driver],
        noAdditionalDrivers: false,
      };
    await tx(() => trial(c, next, admin, 0, nextIntent, "2026-09-01"));
    assert.equal(
      (await getDraft(c, next, admin)).result!.candidates[0].days[0].after[0]
        .driverId,
      backup,
    );
    await c.query(
      "update students set no_pickup_weekdays=array[5] where id=$1",
      [students[3]],
    );
    await assert.rejects(
      tx(() => applyDraft(c, next, admin, 0, 0, "2026-09-01")),
      /changed/,
    );
    await tx(() => trial(c, next, admin, 0, nextIntent, "2026-09-01"));
    await tx(() => applyDraft(c, next, admin, 0, 0, "2026-09-01"));
    assert.equal((await roster("2026-09-11")).length, 3);
    // Locked/started routes cannot be changed; unknown resources and classroom-like grades are rejected.
    const snapshot = await readSnapshot(c, "2026-09-14", "2026-09-14");
    const single = { ...intent, startsOn: "2026-09-14", endsOn: "2026-09-14" };
    assert.throws(
      () =>
        validateIntent(
          { ...single, unavailableVehicleIds: [randomUUID()] },
          snapshot,
          "2026-09-01",
        ),
      /not found/,
    );
    assert.throws(
      () =>
        validateIntent(
          {
            ...single,
            changes: [{ schoolId: school, grades: ["B102"], time: "12:00" }],
          },
          snapshot,
          "2026-09-01",
        ),
      /Check school/,
    );
    assert.equal(
      calculatePlan(snapshot, {
        ...single,
        changes: [{ schoolId: school, grades: ["K", "1"], time: "12:00" }],
        lockedRouteIds: [original.id],
      }).candidates.length,
      0,
    );
    assert.equal(
      calculatePlan(snapshot, {
        ...single,
        unavailableDriverIds: [driver, backup],
      }).candidates.length,
      0,
    );
    assert.equal(
      calculatePlan(snapshot, {
        ...single,
        unavailableVehicleIds: [vehicle, backupVehicle],
      }).candidates.length,
      0,
    );
    // A write failure after calendar mutation must roll back the entire application.
    const failedRequest = await create();
    const future = {
      ...single,
      startsOn: "2026-09-15",
      endsOn: "2026-09-15",
      changes: [{ schoolId: school, grades: ["K", "1"], time: "12:00" }],
    };
    await tx(() => trial(c, failedRequest, admin, 0, future, "2026-09-01"));
    const unchanged = await counts();
    await c.query(
      `create function test_reject_temporary() returns trigger language plpgsql as $$ begin if new.route_type='TEMPORARY' then raise exception 'test forced write failure'; end if; return new; end $$`,
    );
    await c.query(
      "create trigger test_reject before insert on fixed_routes for each row execute function test_reject_temporary()",
    );
    await assert.rejects(
      tx(() => applyDraft(c, failedRequest, admin, 0, 0, "2026-09-01")),
      /test forced write failure/,
    );
    assert.deepEqual(await counts(), unchanged);
    assert.equal((await getDraft(c, failedRequest, admin)).status, "READY");
    await c.query("drop trigger test_reject on fixed_routes");
    // Two connections confirming the same candidate serialize and return one application.
    const other = await pool.connect();
    try {
      await other.query(`set search_path to ${schema}`);
      const secondApply = async () => {
        await other.query("begin");
        try {
          await applyDraft(other, failedRequest, admin, 0, 0, "2026-09-01");
          await other.query("commit");
        } catch (e) {
          await other.query("rollback");
          throw e;
        }
      };
      await Promise.all([
        tx(() => applyDraft(c, failedRequest, admin, 0, 0, "2026-09-01")),
        secondApply(),
      ]);
      assert.equal((await getDraft(c, failedRequest, admin)).status, "APPLIED");
      assert.equal(
        (
          await c.query(
            "select count(*)::int n from fixed_routes where route_type='TEMPORARY' and starts_on='2026-09-15'",
          )
        ).rows[0].n,
        1,
      );
    } finally {
      other.release();
    }
    // A multi-day temporary source is replaced only on the requested day.
    const temporarySetup = await create();
    await tx(() => saveTemporary(c, { sourceIds:[original.id], name:original.name, driverId:backup, vehicleId:backupVehicle, students:original.students, stops:original.stops }, '2026-09-16', temporarySetup, '2026-09-18', [1,2,3,4,5]));
    for (const date of ['2026-09-16','2026-09-17','2026-09-18']) await tx(() => materializeRoutes(c,date,'2026-09-01'));
    const left = await roster('2026-09-16'), middle = await roster('2026-09-17'), right = await roster('2026-09-18');
    const scoped = await create();
    await tx(() => trial(c,scoped,admin,0,{...future,startsOn:'2026-09-17',endsOn:'2026-09-17'},'2026-09-01'));
    await tx(() => applyDraft(c,scoped,admin,0,0,'2026-09-01'));
    assert.deepEqual(await roster('2026-09-16'),left);
    assert.deepEqual(await roster('2026-09-18'),right);
    assert.deepEqual((await roster('2026-09-17')).map(r=>r.id).sort(),middle.map(r=>r.id).sort());
    assert.ok((await roster('2026-09-17')).every(r=>r.time==='12:00'));
    for (const date of ['2026-09-16','2026-09-17','2026-09-18']) await tx(() => materializeRoutes(c,date,'2026-09-01',backup));
    assert.deepEqual(await roster('2026-09-16'),left);assert.deepEqual(await roster('2026-09-18'),right);
    // Provider transport is mocked; no live API requests or spend in tests.
    const oldFetch = globalThis.fetch,
      oldKey = process.env.OPENAI_API_KEY,
      oldModel = process.env.OPENAI_RESCHEDULING_MODEL;
    process.env.OPENAI_API_KEY = "test-only";
    process.env.OPENAI_RESCHEDULING_MODEL = "test-model";
    try {
      globalThis.fetch = async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        assert.equal(body.store, false);
        assert.equal(body.text.format.strict, true);
        assert.ok(!body.input.includes("photo_url"));
        return Response.json({
          status: "completed",
          output: [
            {
              content: [{ type: "output_text", text: JSON.stringify(single) }],
            },
          ],
          usage: {
            input_tokens: 100,
            output_tokens: 40,
            input_tokens_details: { cached_tokens: 0 },
          },
        });
      };
      assert.deepEqual(
        await parseRequest(c, next, ["Test change"], "2026-09-01", "zh"),
        single,
      );
      globalThis.fetch = async () =>
        Response.json({ error: "provider private detail" }, { status: 500 });
      await assert.rejects(
        parseRequest(c, next, ["Test change"], "2026-09-01", "en"),
        /AI service unavailable/,
      );
      assert.equal(
        (
          await c.query(
            "select count(*)::int n from reschedule_usage where request_id=$1",
            [next],
          )
        ).rows[0].n,
        2,
      );
    } finally {
      globalThis.fetch = oldFetch;
      if (oldKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = oldKey;
      if (oldModel === undefined) delete process.env.OPENAI_RESCHEDULING_MODEL;
      else process.env.OPENAI_RESCHEDULING_MODEL = oldModel;
    }
  } finally {
    await c.query(`drop schema ${schema} cascade`);
    c.release();
    await pool.end();
  }
});
