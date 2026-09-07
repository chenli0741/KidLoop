import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { saveStudent, archiveStudent } from "../src/lib/student-management.ts";
import { changeFleetRecord } from "../src/lib/fleet-management.ts";

const url = new URL(process.env.DATABASE_URL);
if (url.searchParams.get("sslmode") === "require") url.searchParams.set("sslmode", "verify-full");
const pool = new pg.Pool({ connectionString: url.toString() });
const c = await pool.connect();
let passed = 0;
const form = (values) => { const f = new FormData(); for (const [key, value] of Object.entries(values)) f.set(key, value ?? ""); return f; };
async function rejected(fn, message) {
  await c.query("savepoint expected_error");
  try { await assert.rejects(fn, (e) => e.message === message); passed++; }
  finally { await c.query("rollback to savepoint expected_error"); }
}
async function studentForm(id, changes = {}) {
  const { rows: [s] } = await c.query("select *, updated_at::text as version from students where id=$1", [id]);
  const p = s.parent_id ? (await c.query("select * from parents where id=$1", [s.parent_id])).rows[0] : {};
  return form({ id, updatedAt: s.version, name: s.name, classroomId: s.classroom_id, programId: s.program_id,
    grade: s.grade, age: s.age, notes: "Edited note", photoUrl: "", parentName: p.name, parentPhone: p.phone,
    relationship: p.relationship, backupPhone: p.backup_phone, email: p.email, ...changes });
}
async function fleetForm(kind, id, changes = {}) {
  const { rows: [r] } = await c.query(`select *,updated_at::text as version from ${kind === "vehicle" ? "vehicles" : "drivers"} where id=$1`, [id]);
  return form({ ...r, id, updatedAt: r.version, ...changes });
}
try {
  await c.query("begin");
  const school = (await c.query("insert into schools (name,address,dismissal_time) values ('CRUD QA','',null) returning id")).rows[0].id;
  const classroom = (await c.query("insert into classrooms (school_id,name) values ($1,'QA') returning id", [school])).rows[0].id;
  const program = (await c.query("insert into after_school_programs (name,address) values ('CRUD QA','') returning id")).rows[0].id;
  const program2 = (await c.query("insert into after_school_programs (name,address) values ('CRUD QA 2','') returning id")).rows[0].id;
  const originalPhoto = "data:image/jpeg;base64,QA";
  const metadata = JSON.stringify({ kind: "historical-test-data", batch: "qa", sources: ["qa.jpg"], note: "Original" });
  const student = (await c.query("insert into students (name,classroom_id,program_id,photo_url,grade,age,notes) values ('QA Student',$1,$2,$3,'',null,$4) returning id", [classroom, program, originalPhoto, metadata])).rows[0].id;
  const original = await studentForm(student);
  await saveStudent(c, original);
  const saved = (await c.query("select * from students where id=$1", [student])).rows[0];
  assert.equal(saved.age, null); assert.equal(saved.parent_id, null); assert.equal(saved.photo_url, originalPhoto);
  assert.deepEqual(JSON.parse(saved.notes), { ...JSON.parse(metadata), note: "Edited note" }); passed++;
  await rejected(() => saveStudent(c, original), "stale");
  await rejected(async () => saveStudent(c, await studentForm(student, { age: "2" })), "age");
  await rejected(async () => saveStudent(c, await studentForm(student, { photoUrl: "javascript:alert(1)" })), "photo");
  await saveStudent(c, await studentForm(student, { parentName: "QA Parent", parentPhone: "", backupPhone: "QA backup", email: "qa@example.test" }));
  const parentId = (await c.query("select parent_id from students where id=$1", [student])).rows[0].parent_id;
  const sibling = (await c.query("insert into students (name,classroom_id,program_id,photo_url,grade,parent_id) values ('QA Sibling',$1,$2,'','',$3) returning id", [classroom, program, parentId])).rows[0].id;
  await saveStudent(c, await studentForm(student, { parentName: "Updated QA Parent" }));
  assert.equal((await c.query("select name from parents where id=$1", [parentId])).rows[0].name, "QA Parent");
  assert.notEqual((await c.query("select parent_id from students where id=$1", [student])).rows[0].parent_id, parentId); passed++;
  const vehicle = (await c.query("insert into vehicles (name,plate,capacity) values ('QA Vehicle',$1,8) returning id", [`QA-${randomUUID()}`])).rows[0].id;
  const driver = (await c.query("insert into drivers (name,phone) values ('QA Driver','') returning id")).rows[0].id;
  await changeFleetRecord(c, "vehicle", await fleetForm("vehicle", vehicle, { plate: "qa-edit", name: "QA Edited", capacity: 6 }), false);
  assert.equal((await c.query("select plate from vehicles where id=$1", [vehicle])).rows[0].plate, "QA-EDIT"); passed++;
  const shift = (await c.query("insert into driver_shifts (driver_id,vehicle_id,shift_date,start_time,end_time) values ($1,$2,current_date,'13:00','17:00') returning id", [driver, vehicle])).rows[0].id;
  const trip = (await c.query("insert into trips (shift_id,school_id,program_id,scheduled_date,departure_time) values ($1,$2,$3,current_date,'14:00') returning id", [shift, school, program])).rows[0].id;
  await c.query("insert into trip_students (trip_id,student_id) values ($1,$2),($1,$3)", [trip, student, sibling]);
  await rejected(async () => saveStudent(c, await studentForm(student, { programId: program2 })), "assigned");
  await rejected(async () => changeFleetRecord(c, "vehicle", await fleetForm("vehicle", vehicle, { capacity: 1 }), false), "seats");
  await rejected(async () => changeFleetRecord(c, "vehicle", await fleetForm("vehicle", vehicle), true), "assigned");
  await rejected(async () => changeFleetRecord(c, "driver", await fleetForm("driver", driver, { status: "OFF_DUTY" }), false), "assigned");
  await archiveStudent(c, await studentForm(student));
  assert.equal((await c.query("select active from students where id=$1", [student])).rows[0].active, false);
  assert.equal((await c.query("select count(*)::int as n from trip_students where student_id=$1", [student])).rows[0].n, 1); passed++;
  await rejected(async () => saveStudent(c, await studentForm(student)), "missing");
  await changeFleetRecord(c, "driver", await fleetForm("driver", driver, { name: "QA Edited Driver", phone: "" }), false); passed++;
  await c.query("update trips set status='COMPLETED' where id=$1", [trip]);
  await c.query("update driver_shifts set status='COMPLETED' where id=$1", [shift]);
  const account = (await c.query("insert into app_users (email,name,password_hash,role,driver_id) values ($1,'QA','no-login','DRIVER',$2) returning id", [`${randomUUID()}@example.test`, driver])).rows[0].id;
  await changeFleetRecord(c, "vehicle", await fleetForm("vehicle", vehicle), true);
  await changeFleetRecord(c, "driver", await fleetForm("driver", driver), true);
  assert.equal((await c.query("select active from vehicles where id=$1", [vehicle])).rows[0].active, false);
  assert.equal((await c.query("select active from drivers where id=$1", [driver])).rows[0].active, false);
  assert.equal((await c.query("select active from app_users where id=$1", [account])).rows[0].active, false);
  assert.equal((await c.query("select id from trips where id=$1", [trip])).rowCount, 1); passed++;
  console.log(`Passed ${passed} record-management checks; all fixtures rolled back.`);
} finally {
  await c.query("rollback");
  c.release();
  await pool.end();
}
