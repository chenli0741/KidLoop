"use server";
import {requireUser} from "@/lib/auth";
import {transaction} from "@/lib/db";
import {finishTripSegment} from "@/lib/finish-trip-segment";
import {readTripExecution} from "@/lib/read-trip-execution";

export async function finishSegment(tripId:string,pickupId:string,dropoffId:string) {
  const user=await requireUser(['ADMIN','DRIVER']);
  return transaction(async c=>{
    await finishTripSegment(c,user,tripId,pickupId,dropoffId);
    return readTripExecution(c,tripId);
  });
}
