"use server";
import {requireUser} from "@/lib/auth";
import {transaction} from "@/lib/db";
import {finishTripSegment} from "@/lib/finish-trip-segment";
import {readTripExecution} from "@/lib/read-trip-execution";

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
