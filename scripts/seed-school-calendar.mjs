import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import pg from "pg";

// User-confirmed defaults, not a claim about official school dismissal times.
const schools = [
  { name: "Ellis", tuesday: "12:45", other: "13:45" },
  { name: "McAuliffe", tuesday: "14:00", other: "14:35" },
  { name: "Stratford School", tuesday: "12:45", other: "13:45" },
];
const grades = ["TK", "K", ...Array.from({ length: 7 }, (_, i) => String(i + 1))];
// OPM 2026/2027 schedules, checked 2026-09-07. Include weekend dates and observed days.
// https://www.opm.gov/policy-data-oversight/pay-leave/federal-holidays/
const holidays = [
  ["2026-01-01", "2026-01-01", "New Year"],
  ["2026-01-19", "2026-01-19", "MLK Day"],
  ["2026-02-16", "2026-02-16", "Washington's Birthday"],
  ["2026-05-25", "2026-05-25", "Memorial Day"],
  ["2026-06-19", "2026-06-19", "Juneteenth"],
  ["2026-07-03", "2026-07-04", "Independence Day (including observed holiday)"],
  ["2026-09-07", "2026-09-07", "Labor Day"],
  ["2026-10-12", "2026-10-12", "Columbus Day"],
  ["2026-11-11", "2026-11-11", "Veterans Day"],
  ["2026-11-26", "2026-11-26", "Thanksgiving"],
  ["2026-12-25", "2026-12-25", "Christmas"],
  ["2027-01-01", "2027-01-01", "New Year"],
  ["2027-01-18", "2027-01-18", "MLK Day"],
  ["2027-02-15", "2027-02-15", "Washington's Birthday"],
  ["2027-05-31", "2027-05-31", "Memorial Day"],
  ["2027-06-18", "2027-06-19", "Juneteenth (including observed holiday)"],
  ["2027-07-04", "2027-07-05", "Independence Day (including observed holiday)"],
  ["2027-09-06", "2027-09-06", "Labor Day"],
  ["2027-10-11", "2027-10-11", "Columbus Day"],
  ["2027-11-11", "2027-11-11", "Veterans Day"],
  ["2027-11-25", "2027-11-25", "Thanksgiving"],
  ["2027-12-24", "2027-12-25", "Christmas (including observed holiday)"],
  ["2027-12-31", "2027-12-31", "New Year 2028 (observed)"],
];
const apply = process.argv.includes("--apply");
const url = new URL(process.env.DATABASE_URL);
if (url.searchParams.get("sslmode") === "require") url.searchParams.set("sslmode", "verify-full");
const pool = new pg.Pool({ connectionString: url.toString() });
const client = await pool.connect();
function idFor(key) {
  const h = createHash("sha256").update(`kidloop-calendar-defaults-20260907:${key}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
const report = { mode: apply ? "applied" : "dry-run (rolled back)", rulesAdded: 0, holidaysAdded: 0, schools: [] };
try {
  await client.query("begin");
  for (const school of schools) {
    const found = await client.query("select id from schools where name=$1 for update", [school.name]);
    assert.equal(found.rowCount, 1, `Expected one school: ${school.name}`);
    const schoolId = found.rows[0].id;
    for (const [key, weekdays, time, name] of [
      ["tuesday", [2], school.tuesday, "Tuesday pickup"],
      ["other", [1, 3, 4, 5], school.other, "Mon, Wed, Thu, Fri pickup"],
    ]) {
      const id = idFor(`${schoolId}:${key}`);
      // Never replace customized or overlapping rules on a subsequent run.
      if ((await client.query("select 1 from school_pickup_rules where id=$1", [id])).rowCount) continue;
      const overlap = await client.query("select 1 from school_pickup_rules where school_id=$1 and weekdays && $2::integer[] and grades && $3::text[]", [schoolId, weekdays, grades]);
      assert.equal(overlap.rowCount, 0, `Existing rule overlaps defaults: ${school.name}`);
      await client.query("insert into school_pickup_rules(id,school_id,name,weekdays,pickup_time,grades) values($1,$2,$3,$4,$5,$6)", [id, schoolId, name, weekdays, time, grades]);
      report.rulesAdded++;
    }
    for (const [start, end, name] of holidays) {
      const id = idFor(`${schoolId}:holiday:${start}`);
      if ((await client.query("select 1 from school_calendar_exceptions where id=$1", [id])).rowCount) continue;
      const overlap = await client.query("select 1 from school_calendar_exceptions where school_id=$1 and starts_on<=$3::date and ends_on>=$2::date", [schoolId, start, end]);
      assert.equal(overlap.rowCount, 0, `Existing calendar exception overlaps ${school.name} ${start}`);
      await client.query("insert into school_calendar_exceptions(id,school_id,name,starts_on,ends_on,pickup_time) values($1,$2,$3,$4,$5,null)", [id, schoolId, name, start, end]);
      report.holidaysAdded++;
    }
    report.schools.push({ name: school.name, id: schoolId });
  }
  await client.query(apply ? "commit" : "rollback");
  // Read back from the committed database, not just the prepared payload.
  if (apply) {
    report.rules = (await client.query("select s.name,p.weekdays,to_char(p.pickup_time,'HH24:MI') as time from school_pickup_rules p join schools s on s.id=p.school_id where s.id=any($1::uuid[]) order by s.name,p.pickup_time", [report.schools.map(s => s.id)])).rows;
    report.closures = (await client.query("select s.name,count(*)::int as closures from school_calendar_exceptions e join schools s on s.id=e.school_id where s.id=any($1::uuid[]) and e.pickup_time is null group by s.name order by s.name", [report.schools.map(s => s.id)])).rows;
  }
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  client.release();
  await pool.end();
}
