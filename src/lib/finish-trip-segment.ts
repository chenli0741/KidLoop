import "server-only";
import type {PoolClient} from "pg";
import type {AuthUser, Trip} from "./types";
import {tripSegments} from "./trip-segments";
import {requireTerm} from "./operating-terms";
import {recomputeTrip} from "./day-plans";

export async function finishTripSegment(c:PoolClient,user:AuthUser,tripId:string,pickupId:string,dropoffId:string) {
  if(!['ADMIN','DRIVER'].includes(user.role) || (user.role==='DRIVER'&&!user.driverId)) throw new Error('Unavailable');
  await c.query('select pg_advisory_xact_lock(70919009)');
  await requireTerm(c);
  const trip=(await c.query(`select t.id,t.status,t.route_stops from trips t join driver_shifts sh on sh.id=t.shift_id
    where t.id=$1 and t.operating_term_id=current_operating_term() and ($2::uuid is null or sh.driver_id=$2)`,[tripId,user.role==='DRIVER'?user.driverId:null])).rows[0];
  if(!trip || ['DRAFT','CANCELED'].includes(trip.status)) throw new Error('Unavailable');
  await c.query('select s.id from students s join trip_students ts on ts.student_id=s.id where ts.trip_id=$1 order by s.id for update of s',[tripId]);
  const locked=(await c.query('select status from trips where id=$1 for update',[tripId])).rows[0];
  if(['DRAFT','CANCELED'].includes(locked.status)) throw new Error('Unavailable');
  const riders=(await c.query('select id,status,pickup_stop_id as "pickupStopId",dropoff_stop_id as "dropoffStopId" from trip_students where trip_id=$1 for update',[tripId])).rows;
  const groups=tripSegments({routeStops:trip.route_stops,riders} as Trip);
  const done=new Set((await c.query("select pickup_stop_id::text||':'||dropoff_stop_id::text as key from trip_segment_completions where trip_id=$1",[tripId])).rows.map(r=>r.key));
  const key=`${pickupId}:${dropoffId}`;
  if(done.has(key))return;
  const current=groups.find(g=>!done.has(`${g.routeStops?.[0]?.id}:${g.routeStops?.at(-1)?.id}`));
  if(!current || current.routeStops?.length!==2 || current.routeStops[0].id!==pickupId || current.routeStops[1].id!==dropoffId || current.riders.some(r=>r.pickupStopId!==pickupId||r.dropoffStopId!==dropoffId)) throw new Error('Finish the current route first');
  if(!current.riders.length) throw new Error('No riders');
  if(current.riders.some(r=>!['PICKED_UP','DROPPED_OFF','ABSENT','EXCEPTION'].includes(r.status))) throw new Error('Resolve all pickups before finishing');
  for(const rider of current.riders) {
    if(['DROPPED_OFF','ABSENT','EXCEPTION'].includes(rider.status)) continue;
    await c.query("update trip_students set status='DROPPED_OFF',dropped_off_at=clock_timestamp(),updated_at=clock_timestamp() where id=$1",[rider.id]);
    await c.query("insert into status_history(trip_student_id,from_status,to_status,actor_id,note) values($1,$2,'DROPPED_OFF',$3,'Driver confirmed all riders dropped off via Finish route')",[rider.id,rider.status,user.id]);
  }
  await c.query('insert into trip_segment_completions(trip_id,pickup_stop_id,dropoff_stop_id,actor_id) values($1,$2,$3,$4)',[tripId,pickupId,dropoffId,user.id]);
  await recomputeTrip(c,tripId);
}
