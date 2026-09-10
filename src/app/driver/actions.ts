"use server";
import {requireUser} from "@/lib/auth";
import {transaction} from "@/lib/db";
import {finishTripSegment} from "@/lib/finish-trip-segment";
import {readTripExecution} from "@/lib/read-trip-execution";
import {normalizeOperationLocation} from "@/lib/operation-location";
import {tripSegments} from "@/lib/trip-segments";
import type {Trip} from "@/lib/types";

export async function finishSegment(tripId:string,pickupId:string,dropoffId:string,location?:unknown) {
  const user=await requireUser(['ADMIN','DRIVER']);
  return transaction(async c=>{
    await finishTripSegment(c,user,tripId,pickupId,dropoffId,location);
    return readTripExecution(c,tripId);
  });
}

export async function confirmPhotoPickup(tripId:string,ids:string[],location?:unknown){
 const user=await requireUser(['DRIVER']);
 const {confirmCameraPickup}=await import('@/lib/pickup-camera/confirm');
 return transaction(c=>confirmCameraPickup(c,user,tripId,ids,location));
}

export async function startTrip(tripId:string, location?:unknown){
  const user=await requireUser(['DRIVER','ADMIN']);
  return transaction(async c=>{
    const row=(await c.query(`select t.status from trips t join driver_shifts sh on sh.id=t.shift_id where t.id=$1 and t.operating_term_id=current_operating_term() and ($2::uuid is null or sh.driver_id=$2) for update`,[tripId,user.role==='DRIVER'?user.driverId:null])).rows[0];
    if(!row || row.status!=='PUBLISHED') throw new Error('Trip is not ready to start.');
    const pending=(await c.query("select 1 from trip_students where trip_id=$1 and status='SCHEDULED'",[tripId])).rowCount;
    if(pending) throw new Error('Resolve all pickups before starting.');
    await c.query("update trips set status='IN_PROGRESS',updated_at=clock_timestamp() where id=$1",[tripId]);
    await c.query("insert into trip_events(trip_id,event_type,actor_id,operation_location) values($1,'STARTED',$2,$3::jsonb)",[tripId,user.id,JSON.stringify(normalizeOperationLocation(location))]);
    return readTripExecution(c,tripId);
  });
}

export async function completeTrip(tripId:string, location?:unknown){
  const user=await requireUser(['DRIVER','ADMIN']);
  return transaction(async c=>{
    const row=(await c.query(`select t.id,t.status,t.route_stops from trips t join driver_shifts sh on sh.id=t.shift_id where t.id=$1 and t.operating_term_id=current_operating_term() and ($2::uuid is null or sh.driver_id=$2) for update`,[tripId,user.role==='DRIVER'?user.driverId:null])).rows[0];
    if(!row || !['IN_PROGRESS','PUBLISHED'].includes(row.status)) throw new Error('Trip is not active.');
    const riders=(await c.query('select id,status,pickup_stop_id as "pickupStopId",dropoff_stop_id as "dropoffStopId" from trip_students where trip_id=$1',[tripId])).rows;
    if(riders.some(r=>r.status==='SCHEDULED')) throw new Error('Resolve all pickups before completing.');
    const segments=tripSegments({routeStops:row.route_stops,riders} as Trip);
    for(const segment of segments) if(segment.routeStops?.length===2 && segment.riders.length) await finishTripSegment(c,user,tripId,segment.routeStops[0].id,segment.routeStops[1].id,location);
    return readTripExecution(c,tripId);
  });
}
