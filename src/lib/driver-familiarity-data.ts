import 'server-only';
import type { PoolClient } from 'pg';
import type { DriverRun } from './driver-familiarity';

export async function readDriverRuns(c: Pick<PoolClient, 'query'>, start: string, end: string): Promise<DriverRun[]> {
  return (await c.query<DriverRun>(`select sh.driver_id as "driverId", coalesce(t.source_route_id,t.fixed_route_id) as "routeId",t.scheduled_date::text as date,
    array(select distinct stop->>'schoolId' from jsonb_array_elements(coalesce(t.route_stops,'[]'::jsonb)) stop where stop->>'schoolId' is not null) as "schoolIds"
    from trips t join driver_shifts sh on sh.id=t.shift_id
    where t.scheduled_date >= $1::date - 180 and t.scheduled_date < $2::date
      and t.status <> 'CANCELED' and (
        exists(select 1 from trip_students ts where ts.trip_id=t.id and ts.picked_up_at is not null)
        or exists(select 1 from trip_segment_completions x where x.trip_id=t.id))
    order by t.scheduled_date,t.id`, [start,end])).rows;
}
