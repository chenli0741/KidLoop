"use server";
import {requireUser} from "@/lib/auth";
import {transaction} from "@/lib/db";
import {advanceTripStopRecord} from "@/lib/advance-trip-stop";

export async function confirmPhotoPickup(tripId:string,ids:string[],location?:unknown){
 const user=await requireUser(['DRIVER'], true);
 const {confirmCameraPickup}=await import('@/lib/pickup-camera/confirm');
 return transaction(c=>confirmCameraPickup(c,user,tripId,ids,location));
}

export async function startTrip(tripId:string, location?:unknown){ return advanceTripStop(tripId, 'GO', location); }
export async function completeTrip(tripId:string, location?:unknown){ return advanceTripStop(tripId, 'GO', location); }

export async function advanceTripStop(tripId:string, action:'GO'|'ARRIVE'|'DROP_OFF', location?:unknown){
  const user=await requireUser(['DRIVER','ADMIN'], true);
  return transaction(c=>advanceTripStopRecord(c,user,tripId,action,location));
}
