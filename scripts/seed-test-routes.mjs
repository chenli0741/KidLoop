import { createHash } from "node:crypto";
import pg from "pg";

const date = process.argv.find((arg) => /^\d{4}-\d{2}-\d{2}$/.test(arg))
  ?? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
if (new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date) throw new Error("Invalid date");
const apply = process.argv.includes("--apply");
const vehicles = [
  { key: "01", name: "测试车 01", plate: "TEST-01", capacity: 14 },
  { key: "02", name: "测试车 02", plate: "TEST-02", capacity: 8 },
];
const routes = [
  { key: "mcauliffe", vehicle: "01", school: "McAuliffe", program: "One Stop", departure: "14:35", count: 6 },
  { key: "stratford", vehicle: "01", school: "Stratford School", program: "晨星中文学校（Saratoga 校区）", departure: "15:30", count: 8 },
  { key: "ellis", vehicle: "02", school: "Ellis", program: "小树苗", departure: "14:30", count: 5 },
];
function idFor(key) {
  const h = createHash("sha256").update(`kidloop-test-routes-v1:${key}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
const url = new URL(process.env.DATABASE_URL);
if (url.searchParams.get("sslmode") === "require") url.searchParams.set("sslmode", "verify-full");
const pool = new pg.Pool({ connectionString: url.toString() });
const client = await pool.connect();
let createdTrips = 0;
let createdAssignments = 0;
try {
  await client.query("begin");
  await client.query("select pg_advisory_xact_lock(hashtext($1))", ["kidloop-test-routes-v1"]);
  for (const vehicle of vehicles) {
    const vehicleId = idFor(`vehicle:${vehicle.key}`);
    const driverId = idFor(`driver:${vehicle.key}`);
    const shiftId = idFor(`shift:${date}:${vehicle.key}`);
    await client.query("insert into vehicles (id,name,plate,capacity) values ($1,$2,$3,$4) on conflict (id) do nothing",
      [vehicleId, vehicle.name, vehicle.plate, vehicle.capacity]);
    await client.query("insert into drivers (id,name,phone) values ($1,$2,'') on conflict (id) do nothing",
      [driverId, `测试司机 ${vehicle.key}`]);
    const available = await client.query(`select 1 from vehicles v, drivers d
      where v.id=$1 and d.id=$2 and v.status='AVAILABLE' and d.status='AVAILABLE' and v.capacity>=$3`,
      [vehicleId, driverId, vehicle.capacity]);
    if (available.rowCount !== 1) throw new Error("Test vehicle/driver unavailable or capacity changed");
    const overlap = await client.query(`select id from driver_shifts where shift_date=$1 and id<>$2
      and status<>'CANCELED' and (vehicle_id=$3 or driver_id=$4) and start_time<'17:00' and end_time>'13:30'`,
      [date, shiftId, vehicleId, driverId]);
    if (overlap.rowCount) throw new Error("Existing driver or vehicle shift overlaps test schedule");
    await client.query(`insert into driver_shifts (id,driver_id,vehicle_id,shift_date,start_time,end_time)
      values ($1,$2,$3,$4,'13:30','17:00') on conflict (id) do nothing`, [shiftId, driverId, vehicleId, date]);
    const shift = await client.query(`select id from driver_shifts where id=$1 and driver_id=$2 and vehicle_id=$3
      and shift_date=$4 and start_time='13:30' and end_time='17:00' and status<>'CANCELED'`, [shiftId, driverId, vehicleId, date]);
    if (shift.rowCount !== 1) throw new Error("Existing test shift was changed; leaving it intact");
  }
  for (const route of routes) {
    const roster = await client.query(`select st.id, c.school_id, st.program_id from students st
      join classrooms c on c.id=st.classroom_id join schools sc on sc.id=c.school_id
      join after_school_programs p on p.id=st.program_id
      where st.active and sc.name=$1 and p.name=$2 and st.notes like $3 order by st.id`,
      [route.school, route.program, `%"batch":"historical-roster-20260907-${route.key}-v1"%`]);
    if (roster.rowCount !== route.count) throw new Error(`Unexpected imported roster size for ${route.school}`);
    const schoolId = roster.rows[0].school_id;
    const programId = roster.rows[0].program_id;
    if (roster.rows.some((row) => row.school_id !== schoolId || row.program_id !== programId)) throw new Error("Ambiguous route locations");
    const tripId = idFor(`trip:${date}:${route.key}`);
    const shiftId = idFor(`shift:${date}:${route.vehicle}`);
    const duplicate = await client.query(`select ts.id from trip_students ts join trips t on t.id=ts.trip_id
      where t.scheduled_date=$1 and t.status<>'CANCELED' and t.id<>$2 and ts.student_id=any($3::uuid[])`,
      [date, tripId, roster.rows.map((row) => row.id)]);
    if (duplicate.rowCount) throw new Error(`Students already have another trip: ${route.school}`);
    const inserted = await client.query(`insert into trips (id,shift_id,school_id,program_id,scheduled_date,departure_time)
      values ($1,$2,$3,$4,$5,$6) on conflict (id) do nothing returning id`,
      [tripId, shiftId, schoolId, programId, date, route.departure]);
    createdTrips += inserted.rowCount;
    const matching = await client.query(`select id from trips where id=$1 and shift_id=$2 and school_id=$3
      and program_id=$4 and scheduled_date=$5 and departure_time=$6`, [tripId, shiftId, schoolId, programId, date, route.departure]);
    if (matching.rowCount !== 1) throw new Error("Existing test trip was changed; leaving it intact");
    for (const student of roster.rows) {
      const rider = await client.query(`insert into trip_students (trip_id,student_id,notes) values ($1,$2,$3)
        on conflict (trip_id,student_id) do nothing returning id`,
        [tripId, student.id, "Test scenario only; departure times are simulated, not a real pickup commitment."]);
      if (rider.rowCount) {
        createdAssignments++;
        await client.query("insert into status_history (trip_student_id,from_status,to_status,note) values ($1,null,'SCHEDULED',$2)",
          [rider.rows[0].id, "Created by test-routes-v1 seed"]);
      }
    }
  }
  const reportSql = `select v.plate,sc.name as school,p.name as program,t.departure_time::text,t.status,
    count(ts.id)::int as students,v.capacity from trips t join driver_shifts sh on sh.id=t.shift_id
    join vehicles v on v.id=sh.vehicle_id join schools sc on sc.id=t.school_id
    join after_school_programs p on p.id=t.program_id left join trip_students ts on ts.trip_id=t.id
    where t.id=any($1::uuid[]) group by t.id,v.id,sc.id,p.id order by v.plate,t.departure_time`;
  const ids = routes.map((route) => idFor(`trip:${date}:${route.key}`));
  const preview = await client.query(reportSql, [ids]);
  if (preview.rowCount !== 3 || preview.rows.some((row) => row.students > row.capacity)
    || preview.rows.reduce((sum, row) => sum + row.students, 0) !== 19) throw new Error("Route verification failed");
  await client.query(apply ? "commit" : "rollback");
  const report = apply ? await client.query(reportSql, [ids]) : preview;
  console.log(JSON.stringify({ date, mode: apply ? "applied" : "dry-run (rolled back)", createdTrips, createdAssignments, routes: report.rows }, null, 2));
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  client.release();
  await pool.end();
}
