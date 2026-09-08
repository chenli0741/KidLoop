import type { PoolClient } from "pg";
import type { FixedRoute, RouteStop, RouteStudent } from "./fixed-route-types";

export type PickupMatch = {
  student_id: string;
  school_id: string;
  time: string;
};
export async function readPickupMatches(
  c: Pick<PoolClient, "query">,
  ids: string[],
  date: string,
): Promise<PickupMatch[]> {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay() || 7;
  return (
    await c.query<PickupMatch>(
      `select s.id as student_id,s.school_id,
    school_special_pickup_time(e.grade_times,s.grade,e.pickup_time,p.pickup_time)::text as time
    from students s join school_terms t on t.operating_term_id=current_operating_term() and t.school_id=s.school_id and $2::date between t.starts_on and t.ends_on
    join school_pickup_rules p on p.operating_term_id=current_operating_term() and p.school_id=s.school_id and trim(s.grade)=any(p.grades) and $3=any(p.weekdays)
    left join school_calendar_exceptions e on e.operating_term_id=current_operating_term() and e.school_id=s.school_id and $2::date between e.starts_on and e.ends_on
    where s.id=any($1::uuid[]) and s.active and not ($3=any(s.no_pickup_weekdays))
    and (e.id is null or e.pickup_time is not null or jsonb_array_length(e.grade_times)>0)`,
      [ids, date, weekday],
    )
  ).rows;
}
export const minutes = (time: string) =>
  Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
export const clockTime = (n: number) =>
  `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
export function activeOn(r: FixedRoute, date: string) {
  return (
    r.enabled &&
    r.driverId &&
    r.vehicleId &&
    r.startsOn <= date &&
    date <= r.endsOn &&
    r.weekdays.includes(new Date(`${date}T12:00:00Z`).getUTCDay() || 7)
  );
}
export function planRoute(
  r: FixedRoute,
  matches: PickupMatch[],
): { students: RouteStudent[]; stops: RouteStop[] } {
  const byStudent = new Map<string, PickupMatch>();
  for (const m of matches)
    if (!byStudent.has(m.student_id)) byStudent.set(m.student_id, m);
  const schoolTimes = new Map<string, string>();
  const students = r.students.filter((a) => {
    const stop = r.stops.find((s) => s.id === a.pickupStopId),
      match = byStudent.get(a.studentId);
    if (!stop || !match || match.school_id !== stop.schoolId) return false;
    const time = match.time.slice(0, 5);
    if (time > (schoolTimes.get(stop.id) ?? "")) schoolTimes.set(stop.id, time);
    return true;
  });
  const stops = r.stops.map((s) => ({ ...s }));
  const anchor = stops.find((s) => schoolTimes.has(s.id));
  const delta = anchor
    ? minutes(schoolTimes.get(anchor.id)!) - minutes(anchor.time)
    : 0;
  for (let i = 0; i < stops.length; i++) {
    const arrival =
      i === 0
        ? minutes(r.stops[0].time) + delta
        : minutes(stops[i - 1].time) +
          minutes(r.stops[i].time) -
          minutes(r.stops[i - 1].time);
    stops[i].time = clockTime(
      Math.max(
        arrival,
        schoolTimes.has(stops[i].id)
          ? minutes(schoolTimes.get(stops[i].id)!)
          : arrival,
      ),
    );
  }
  return {
    students,
    stops: stops.filter(
      (s) =>
        !s.schoolId ||
        students.some(
          (a) => a.pickupStopId === s.id || a.dropoffStopId === s.id,
        ),
    ),
  };
}
export function overCapacity(
  stops: RouteStop[],
  students: RouteStudent[],
  capacity: number,
) {
  return stops.some(
    (_, i) =>
      students.filter(
        (a) =>
          stops.findIndex((s) => s.id === a.pickupStopId) <= i &&
          stops.findIndex((s) => s.id === a.dropoffStopId) > i,
      ).length > capacity,
  );
}
export function overlaps(
  a: { start: string; end: string },
  b: { start: string; end: string },
) {
  return a.start < b.end && a.end > b.start;
}
