import 'server-only';
import type { PoolClient } from 'pg';
import type { TripExecution } from './trip-execution';

// Called inside an authorized mutation transaction. Rider timestamps participate
// in the version so independent status writes do not require a trip-wide lock.
export async function readTripExecution(c: PoolClient, tripId: string): Promise<TripExecution> {
  const result = await c.query<TripExecution>(`
    select t.id as "tripId",to_char(greatest(t.updated_at,coalesce((select max(ts.updated_at) from trip_students ts where ts.trip_id=t.id),t.updated_at)) at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US') as version,t.status,
      t.current_stop_index as "currentStopIndex", t.progress_state as "progressState",
      array(select pickup_stop_id::text||':'||dropoff_stop_id::text from trip_segment_completions where trip_id=t.id) as "completedSegments",
      coalesce((select jsonb_agg(jsonb_build_object('id',ts.id,'status',ts.status,'missedPickupNote',
        (select note from status_history where trip_student_id=ts.id and to_status='EXCEPTION' order by created_at desc limit 1)))
        from trip_students ts where ts.trip_id=t.id),'[]') as riders
    from trips t where t.id=$1`, [tripId]);
  return result.rows[0];
}
