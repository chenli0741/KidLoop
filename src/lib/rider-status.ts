import {normalizeOperationLocation} from './operation-location';
import { claimSharedPickup } from './shared-pickups';
import "server-only";
import type { PoolClient } from "pg";
import type { AuthUser, RiderStatus } from "./types";
import { requireTerm } from "./operating-terms";
import { recomputeTrip } from "./day-plans";
import { missedPickupReasons, type MissedPickupDetails } from "./missed-pickup";

export async function changeRiderStatus(client: PoolClient, user: AuthUser, assignmentId: string, nextStatus: RiderStatus, details?: MissedPickupDetails, targetTripId?: string, location?: unknown) {
  if (!["ADMIN", "DRIVER"].includes(user.role) || (user.role === "DRIVER" && !user.driverId)) throw new Error("Assignment unavailable.");
  await client.query("select pg_advisory_xact_lock(70919009)");
  await requireTerm(client);
  if(!targetTripId) {
    const shared=(await client.query("select ts.trip_id from trip_students ts where ts.id=$1 and exists(select 1 from shared_pickup_members m where m.assignment_id=ts.id)",[assignmentId])).rows[0];
    if(shared) targetTripId=shared.trip_id;
  }
  let oldTripId: string | undefined;
  if(targetTripId) oldTripId = await claimSharedPickup(client,user,assignmentId,targetTripId,nextStatus);
  const target = await client.query<{ student_id: string; trip_id: string }>(`
    select ts.student_id, ts.trip_id from trip_students ts
    join trips t on t.id = ts.trip_id join driver_shifts sh on sh.id = t.shift_id
    where ts.id = $1::uuid and t.operating_term_id = current_operating_term()
      and ($2::uuid is null or sh.driver_id = $2)
  `, [assignmentId, user.role === "DRIVER" ? user.driverId : null]);
  if (!target.rowCount) throw new Error("Assignment unavailable.");
  const { student_id: studentId, trip_id: tripId } = target.rows[0];
  // Match parent-plan and route-completion lock order.
  await client.query("select id from students where id = $1 for update", [studentId]);
  const trip = await client.query<{ status: string }>("select status from trips where id = $1 for update", [tripId]);
  const current = await client.query<{ trip_id:string; status: RiderStatus; parent_absence: boolean; pickup_stop_id: string; dropoff_stop_id: string }>(
    "select trip_id, status, parent_absence, pickup_stop_id, dropoff_stop_id from trip_students where id = $1 for update", [assignmentId],
  );
  const rider = current.rows[0];
  if(!rider || rider.trip_id!==tripId)throw new Error('Assignment changed. Refresh before updating.');
  const undo = rider.status === "DROPPED_OFF" && nextStatus === "PICKED_UP";
  if (["DRAFT", "CANCELED"].includes(trip.rows[0].status) || (trip.rows[0].status === "COMPLETED" && !undo)) throw new Error("Trip is not active.");
  const allowed: Record<RiderStatus, RiderStatus[]> = {
    SCHEDULED: ["PICKED_UP", "ABSENT", "EXCEPTION"],
    PICKED_UP: ["SCHEDULED", "ABSENT"],
    DROPPED_OFF: ["PICKED_UP"], ABSENT: [], EXCEPTION: ["PICKED_UP", "ABSENT"],
  };
  if (rider.parent_absence || !allowed[rider.status].includes(nextStatus)) throw new Error("This status change is not allowed.");
  const reason = missedPickupReasons.find(item => item.id === details?.reason);
  if (nextStatus === "EXCEPTION" && (!reason || details?.parentNotified !== true)) throw new Error("Select a reason and confirm parent notified.");
  await client.query(`
    update trip_students set status = $2,
      picked_up_at = case when $2 = 'SCHEDULED' then null when $2 = 'PICKED_UP' and not $3 then now() else picked_up_at end,
      dropped_off_at = case when $3 or $2 = 'SCHEDULED' then null else dropped_off_at end,
      updated_at = now() where id = $1
  `, [assignmentId, nextStatus, undo]);
  if (undo) {
    await client.query("delete from trip_segment_completions where trip_id = $1 and pickup_stop_id = $2 and dropoff_stop_id = $3", [tripId, rider.pickup_stop_id, rider.dropoff_stop_id]);
  }
  await client.query("insert into status_history (trip_student_id, from_status, to_status, actor_id, note, operation_location) values ($1, $2, $3, $4, $5, $6::jsonb)", [assignmentId, rider.status, nextStatus, user.id, nextStatus === "EXCEPTION" ? `${reason!.zh} / ${reason!.en}; 已通知家长自行安排接送 / Parent notified to arrange pickup` : "", JSON.stringify(normalizeOperationLocation(location))]);
  await recomputeTrip(client, tripId);
  if(oldTripId && oldTripId!==tripId) await recomputeTrip(client,oldTripId);
  await client.query(`update trips set updated_at=clock_timestamp() where id in (select trip_id from shared_pickup_members where assignment_id=$1)`,[assignmentId]);
  return tripId;
}
