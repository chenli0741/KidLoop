import type { PoolClient } from "pg";
import type { AuthUser } from "./types";
import { normalizeOperationLocation } from "./operation-location";

/** Shared compatibility hook for old server imports; the driver action owns the normal transaction. */
export async function advanceTripStopForClient(c: PoolClient, user: AuthUser, tripId: string, action: "DROP_OFF", location?: unknown) {
  const row = (await c.query<{ current_stop_index: number; route_stops: Array<{id:string;programId:string|null}> }>("select current_stop_index,route_stops from trips where id=$1 for update", [tripId])).rows[0];
  if (!row) throw new Error("Trip unavailable.");
  const stop = row.route_stops[row.current_stop_index];
  if (!stop?.programId) throw new Error("Current stop does not accept drop-off.");
  const riders = (await c.query<{id:string;status:string}>("select id,status from trip_students where trip_id=$1 and dropoff_stop_id=$2 for update", [tripId, stop.id])).rows;
  for (const rider of riders.filter(item => item.status === "PICKED_UP")) {
    await c.query("update trip_students set status='DROPPED_OFF',dropped_off_at=clock_timestamp(),updated_at=clock_timestamp() where id=$1", [rider.id]);
    await c.query("insert into status_history(trip_student_id,from_status,to_status,actor_id,note,operation_location) values($1,$2,'DROPPED_OFF',$3,'Drop off at current stop',$4::jsonb)", [rider.id, rider.status, user.id, JSON.stringify(normalizeOperationLocation(location))]);
  }
}
