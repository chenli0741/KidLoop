import "server-only";
import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { readFixedRoutes } from "../fixed-routes";
import { openTerm } from "../operating-terms";
import { readPickupMatches } from "../route-plan";
import type { Snapshot, Rider, Resource, Task } from "./types";
export function datesBetween(start: string, end: string) {
  const days: string[] = [];
  for (
    let d = Date.parse(start);
    d <= Date.parse(end) && days.length <= 14;
    d += 86400000
  )
    days.push(new Date(d).toISOString().slice(0, 10));
  return days;
}
export async function readSnapshot(
  c: PoolClient,
  start: string,
  end: string,
): Promise<Snapshot> {
  const term = await openTerm(c);
  if (!term) throw new Error("请先设置运营学期 / Set up an operating term");
  const routes = await readFixedRoutes(c);
  if (routes.length > 100)
    throw new Error(
      "线路范围过大，请缩小运营范围 / Too many routes for this trial",
    );
  const students = (
    await c.query<Rider>(`select s.id,s.name,s.school_id as "schoolId",trim(s.grade) as grade,s.program_id as "programId",ts.reviewed
    from students s join term_students ts on ts.student_id=s.id and ts.operating_term_id=current_operating_term() where s.active order by s.id`)
  ).rows;
  const drivers = (
    await c.query<Resource>(
      "select id,name,active,status from drivers order by id",
    )
  ).rows;
  const vehicles = (
    await c.query<Resource>(
      "select id,name,active,status,capacity from vehicles order by id",
    )
  ).rows;
  const travelTimes = (await c.query<{ fromName: string; toName: string; minutes: number; originDwellMinutes: number }>(
    "select from_name as \"fromName\",to_name as \"toName\",estimated_minutes + buffer_minutes as minutes,origin_dwell_minutes as \"originDwellMinutes\" from travel_time_profiles where active order by from_name,to_name",
  )).rows;
  const days: Snapshot["days"] = [];
  for (const date of datesBetween(start, end)) {
    const matches = await readPickupMatches(
      c,
      students.map((s) => s.id),
      date,
    );
    const tasks = (
      await c.query<Task>(
        `select t.fixed_route_id as "routeId",t.id as "tripId",sh.driver_id as "driverId",sh.vehicle_id as "vehicleId",to_char(sh.start_time,'HH24:MI') as start,to_char(sh.end_time,'HH24:MI') as end,
      (exists(select 1 from trip_segment_completions f where f.trip_id=t.id) or exists(select 1 from trip_students x where x.trip_id=t.id and (x.picked_up_at is not null or x.status in ('PICKED_UP','DROPPED_OFF','EXCEPTION') or (x.status='ABSENT' and not x.parent_absence)))) as started,
      coalesce(t.route_stops,'[]') as stops,
      coalesce((select jsonb_agg(jsonb_build_object('studentId',x.student_id,'pickupStopId',x.pickup_stop_id,'dropoffStopId',x.dropoff_stop_id) order by x.student_id) from trip_students x where x.trip_id=t.id),'[]') as students
      from trips t join driver_shifts sh on sh.id=t.shift_id where t.operating_term_id=current_operating_term() and t.scheduled_date=$1 and t.status<>'CANCELED' order by t.id`,
        [date],
      )
    ).rows;
    tasks.push(
      ...(
        await c.query<Task>(
          `select null as \"routeId\",'' as \"tripId\",driver_id as \"driverId\",vehicle_id as \"vehicleId\",to_char(start_time,'HH24:MI') as start,to_char(end_time,'HH24:MI') as end,true as started,'[]'::jsonb as students,'[]'::jsonb as stops from driver_shifts sh where shift_date=$1 and status<>'CANCELED' and not exists(select 1 from trips t where t.shift_id=sh.id and t.status<>'CANCELED') order by id`,
          [date],
        )
      ).rows,
    );
    const absentIds = (
      await c.query<{ student_id: string }>(
        "select student_id from student_day_plans where service_date=$1 and absent order by student_id",
        [date],
      )
    ).rows.map((s) => s.student_id);
    days.push({ date, matches, tasks, absentIds });
  }
  // Include changes that do not yet have a materialized trip, and new conflicting records.
  // Exclude derived trip.updated_at: a no-op page refresh must not invalidate a draft.
  const facts = (
    await c.query(
      `select
    (select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from school_calendar_schedules x where operating_term_id=current_operating_term()) as exceptions,
    (select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from school_pickup_rules x where operating_term_id=current_operating_term()) as rules,
    (select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from school_terms x where operating_term_id=current_operating_term()) as terms,
    (select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'address',address,'cutoff',calendar_archived_through) order by id),'[]') from schools) as schools,
    (select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'address',address) order by id),'[]') from after_school_programs) as programs,
    (select coalesce(jsonb_agg(jsonb_build_object('id',id,'weekdays',no_pickup_weekdays,'active',active) order by id),'[]') from students) as eligibility,
    (select coalesce(jsonb_agg(to_jsonb(x) order by x.student_id,x.service_date),'[]') from student_day_plans x where service_date between $1 and $2) as plans,
    (select coalesce(jsonb_agg((to_jsonb(x)-'updated_at') order by x.id),'[]') from trip_students x join trips t on t.id=x.trip_id where t.operating_term_id=current_operating_term() and t.scheduled_date between $1 and $2) as execution,
    (select coalesce(jsonb_agg((to_jsonb(x)-'updated_at') order by x.id),'[]') from driver_shifts x where shift_date between $1 and $2 and status<>'CANCELED') as shifts`,
      [start, end],
    )
  ).rows[0];
  const snapshot = { term, routes, students, drivers, vehicles, days };
  return {
    ...snapshot,
    travelTimes,
    hash: createHash("sha256")
      .update(JSON.stringify({ ...snapshot, facts }))
      .digest("hex"),
  };
}
