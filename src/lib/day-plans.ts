import "server-only";
import type { PoolClient } from "pg";
import type { AuthUser } from "@/lib/types";
import { todayInOperationsTimeZone } from "@/lib/date";

export function validServiceDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

export async function recomputeTrip(client: PoolClient, tripId: string) {
  await client.query(`
    update trips set status = (
      select case when bool_and(status in ('DROPPED_OFF', 'ABSENT', 'EXCEPTION')) then 'COMPLETED'
        when (select status from trips where id=$1) = 'IN_PROGRESS' then 'IN_PROGRESS'
        else 'PUBLISHED' end from trip_students where trip_id = $1
    ), updated_at = clock_timestamp() where id = $1 and status not in ('CANCELED', 'DRAFT')
  `, [tripId]);
}

export async function saveDayPlan(client: PoolClient, user: AuthUser, input: {
  studentId: string; date: string; absent: boolean; note: string;
}) {
  if (user.role !== "PARENT") throw new Error("FORBIDDEN");
  if (!validServiceDate(input.date) || input.date < todayInOperationsTimeZone()) throw new Error("INVALID_DATE");
  if (input.note.length > 1000) throw new Error("NOTE_TOO_LONG");
  await client.query('select pg_advisory_xact_lock(70919009)');
  if(!(await client.query("select 1 from operating_terms o join term_students ts on ts.operating_term_id=o.id where o.status='OPEN' and ts.student_id=$1 and $2::date between o.starts_on and o.ends_on",[input.studentId,input.date])).rowCount)throw new Error("INVALID_DATE");
  const child = await client.query(`
    select st.id from students st where st.id = $1::uuid and st.active
      and exists (select 1 from user_students us where us.student_id = st.id and us.user_id = $2)
    for update
  `, [input.studentId, user.id]);
  if (!child.rowCount) throw new Error("FORBIDDEN");
  const trips = await client.query<{ id: string }>(`
    select t.id from trips t where t.scheduled_date = $2::date
      and t.status not in ('CANCELED', 'DRAFT')
      and exists (select 1 from trip_students ts where ts.trip_id = t.id and ts.student_id = $1)
    order by t.id for update
  `, [input.studentId, input.date]);
  const assignments = await client.query<{ finished: boolean; id: string; trip_id: string; status: string; picked_up_at: Date | null; parent_absence: boolean }>(`
    select id, trip_id, status, picked_up_at, parent_absence,
      exists(select 1 from trip_segment_completions f where f.trip_id=trip_students.trip_id and f.pickup_stop_id=trip_students.pickup_stop_id and f.dropoff_stop_id=trip_students.dropoff_stop_id) as finished from trip_students
    where student_id = $1 and trip_id = any($2::uuid[]) order by id for update
  `, [input.studentId, trips.rows.map((t) => t.id)]);
  if (input.absent && assignments.rows.some((r) => r.picked_up_at || ["PICKED_UP", "DROPPED_OFF"].includes(r.status))) {
    throw new Error("ALREADY_PICKED_UP");
  }
  await client.query(`
    insert into student_day_plans (student_id, service_date, absent, note, updated_by)
    values ($1, $2::date, $3, $4, $5)
    on conflict (student_id, service_date) do update set absent = excluded.absent,
      note = excluded.note, updated_by = excluded.updated_by, updated_at = now()
  `, [input.studentId, input.date, input.absent, input.note, user.id]);
  await client.query("insert into student_day_plan_history (student_id, service_date, absent, note, actor_id) values ($1, $2::date, $3, $4, $5)", [input.studentId, input.date, input.absent, input.note, user.id]);
  for (const rider of assignments.rows) {
    if (rider.finished) continue;
    // A parent's cancellation must never reverse an absence recorded by a driver.
    const next = input.absent && rider.status === "SCHEDULED" ? "ABSENT"
      : !input.absent && rider.parent_absence && rider.status === "ABSENT" ? "SCHEDULED" : null;
    if (!next) continue;
    await client.query("update trip_students set status = $2, parent_absence = $3, updated_at = now() where id = $1", [rider.id, next, input.absent]);
    await client.query("insert into status_history (trip_student_id, from_status, to_status, actor_id, note) values ($1, $2, $3, $4, $5)", [rider.id, rider.status, next, user.id, input.absent ? "Parent reported absence" : "Parent canceled absence"]);
  }
  for (const trip of trips.rows) await recomputeTrip(client, trip.id);
}
