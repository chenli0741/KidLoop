"use server";
import {requireUser} from "@/lib/auth";
import {transaction} from "@/lib/db";
import {readTripExecution} from "@/lib/read-trip-execution";
import {normalizeOperationLocation} from "@/lib/operation-location";
import type {RouteStop} from "@/lib/fixed-route-types";

export async function confirmPhotoPickup(tripId:string,ids:string[],location?:unknown){
 const user=await requireUser(['DRIVER']);
 const {confirmCameraPickup}=await import('@/lib/pickup-camera/confirm');
 return transaction(c=>confirmCameraPickup(c,user,tripId,ids,location));
}

export async function startTrip(tripId:string, location?:unknown){ return advanceTripStop(tripId, 'GO', location); }
export async function completeTrip(tripId:string, location?:unknown){ return advanceTripStop(tripId, 'GO', location); }

export async function advanceTripStop(tripId:string, action:'GO'|'ARRIVE'|'DROP_OFF', location?:unknown){
  const user=await requireUser(['DRIVER','ADMIN']);
  return transaction(async c=>{
    const row=(await c.query<{route_stops:RouteStop[]|null;current_stop_index:number;progress_state:'AT_STOP'|'IN_TRANSIT'}>(`select t.route_stops,t.current_stop_index,t.progress_state from trips t join driver_shifts sh on sh.id=t.shift_id where t.id=$1 and t.operating_term_id=current_operating_term() and ($2::uuid is null or sh.driver_id=$2) for update`,[tripId,user.role==='DRIVER'?user.driverId:null])).rows[0];
    if(!row || !row.route_stops?.length) throw new Error('Trip stops are unavailable.');
    const index=row.current_stop_index, stop=row.route_stops[index];
    if(!stop) throw new Error('Trip is already complete.');
    const snapshot=JSON.stringify(normalizeOperationLocation(location));
    if(action==='ARRIVE') {
      if(row.progress_state!=='IN_TRANSIT') throw new Error('Trip is not in transit.');
      const next=Math.min(index+1,row.route_stops.length-1);
      await c.query("update trips set current_stop_index=$2,progress_state='AT_STOP',status='IN_PROGRESS',updated_at=clock_timestamp() where id=$1",[tripId,next]);
      await c.query("insert into trip_stop_events(trip_id,stop_index,event_type,actor_id,operation_location) values($1,$2,'ARRIVED',$3,$4::jsonb)",[tripId,next,user.id,snapshot]);
      return readTripExecution(c,tripId);
    }
    if(row.progress_state!=='AT_STOP') throw new Error('Arrive at the current stop first.');
    const riders=(await c.query<{id:string;status:string;pickup_stop_id:string|null;dropoff_stop_id:string|null}>("select id,status,pickup_stop_id,dropoff_stop_id from trip_students where trip_id=$1 for update",[tripId])).rows;
    const atPickup=riders.filter(r=>r.pickup_stop_id===stop.id);
    const atDropoff=riders.filter(r=>r.dropoff_stop_id===stop.id);
    if(action==='DROP_OFF') {
      if(!stop.programId) throw new Error('This stop does not accept drop-off.');
      for(const rider of atDropoff.filter(r=>r.status==='PICKED_UP')) {
        await c.query("update trip_students set status='DROPPED_OFF',dropped_off_at=clock_timestamp(),updated_at=clock_timestamp() where id=$1",[rider.id]);
        await c.query("insert into status_history(trip_student_id,from_status,to_status,actor_id,note,operation_location) values($1,$2,'DROPPED_OFF',$3,'Drop off at current stop',$4::jsonb)",[rider.id,rider.status,user.id,snapshot]);
      }
      await c.query("insert into trip_stop_events(trip_id,stop_index,event_type,actor_id,operation_location) values($1,$2,'DROP_OFF',$3,$4::jsonb)",[tripId,index,user.id,snapshot]);
      await c.query("update trips set updated_at=clock_timestamp() where id=$1",[tripId]);
      return readTripExecution(c,tripId);
    }
    if(stop.schoolId && atPickup.some(r=>r.status==='SCHEDULED')) throw new Error('Resolve all students at this school first.');
    if(stop.programId && atDropoff.some(r=>r.status==='PICKED_UP')) throw new Error('Drop off all students at this stop first.');
    if(index===row.route_stops.length-1) await c.query("update trips set status='COMPLETED',progress_state='AT_STOP',updated_at=clock_timestamp() where id=$1",[tripId]);
    else await c.query("update trips set status='IN_PROGRESS',progress_state='IN_TRANSIT',updated_at=clock_timestamp() where id=$1",[tripId]);
    await c.query("insert into trip_stop_events(trip_id,stop_index,event_type,actor_id,operation_location) values($1,$2,'GO',$3,$4::jsonb)",[tripId,index,user.id,snapshot]);
    return readTripExecution(c,tripId);
  });
}
