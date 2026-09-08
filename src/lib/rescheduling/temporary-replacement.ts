import "server-only";
import type { PoolClient } from "pg";
import type { Candidate, PlannedRoute, Snapshot } from "./types";
const nextDate = (date: string, delta: number) =>
  new Date(Date.parse(date) + delta * 86400000).toISOString().slice(0, 10);
export function remainingDateRanges(
  start: string,
  end: string,
  excluded: Set<string>,
) {
  const ranges: { start: string; end: string }[] = [];
  let first: string | null = null;
  for (let date = start; date <= end; date = nextDate(date, 1)) {
    if (excluded.has(date)) {
      if (first) ranges.push({ start: first, end: nextDate(date, -1) });
      first = null;
    } else first ??= date;
  }
  if (first) ranges.push({ start: first, end });
  return ranges;
}
export async function retireTemporarySources(
  c: PoolClient,
  snapshot: Snapshot,
  candidate: Candidate,
  requestId: string,
  today: string,
  save: (
    c: PoolClient,
    route: PlannedRoute,
    start: string,
    requestId: string,
    end: string,
    weekdays: number[],
  ) => Promise<unknown>,
) {
  const changed = snapshot.routes.filter(
    (r) =>
      r.routeType === "TEMPORARY" &&
      candidate.days.some((d) => d.replaceIds.includes(r.id)),
  );
  const carryDates = new Set<string>();
  for (const route of changed) {
    const replacedDates = new Set(
      candidate.days
        .filter((d) => d.replaceIds.includes(route.id))
        .map((d) => d.date),
    );
    const existing = (
      await c.query<{ date: string; started: boolean }>(
        `select t.scheduled_date::text as date,
      (exists(select 1 from trip_segment_completions f where f.trip_id=t.id) or exists(select 1 from trip_students s where s.trip_id=t.id and (s.picked_up_at is not null or s.status in ('PICKED_UP','DROPPED_OFF','EXCEPTION') or (s.status='ABSENT' and not s.parent_absence)))) as started
      from trips t where t.fixed_route_id=$1 and t.scheduled_date>=$2 order by t.scheduled_date for update`,
        [route.id, today],
      )
    ).rows;
    if (existing.some((t) => t.started && replacedDates.has(t.date)))
      throw new Error(
        "任务已开始，不能重新安排 / Trip has started and cannot be rescheduled",
      );
    // Already-executed dates remain attached to the original record. Future
    // unstarted dates outside this request keep identical rosters and resources.
    const excluded = new Set([
      ...replacedDates,
      ...existing.filter((t) => t.started).map((t) => t.date),
    ]);
    await c.query(
      "update fixed_routes set enabled=false,updated_at=clock_timestamp() where id=$1",
      [route.id],
    );
    for (const range of remainingDateRanges(
      route.startsOn < today ? today : route.startsOn,
      route.endsOn,
      excluded,
    )) {
      let hasService = false;
      for (let d = range.start; d <= range.end; d = nextDate(d, 1)) {
        if (route.weekdays.includes(new Date(`${d}T12:00:00Z`).getUTCDay() || 7)) {
          hasService = true;
          break;
        }
      }
      if (!hasService) continue;
      await save(
        c,
        {
          sourceIds: [route.id],
          name: route.name,
          driverId: route.driverId!,
          vehicleId: route.vehicleId!,
          stops: route.stops,
          students: route.students,
        },
        range.start,
        requestId,
        range.end,
        route.weekdays,
      );
    }
    for (const task of existing)
      if (!task.started) {
        await c.query(
          "update driver_shifts set status='CANCELED' where id in(select shift_id from trips where fixed_route_id=$1 and scheduled_date=$2)",
          [route.id, task.date],
        );
        carryDates.add(task.date);
      }
  }
  return [...carryDates].sort();
}
