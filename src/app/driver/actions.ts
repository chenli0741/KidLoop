"use server";
import {requireUser} from "@/lib/auth";
import {transaction} from "@/lib/db";
import {finishTripSegment} from "@/lib/finish-trip-segment";
import {revalidatePath} from "next/cache";

export async function finishSegment(tripId:string,pickupId:string,dropoffId:string) {
  const user=await requireUser(['ADMIN','DRIVER']);
  await transaction(c=>finishTripSegment(c,user,tripId,pickupId,dropoffId));
  revalidatePath('/driver');revalidatePath('/');revalidatePath('/parent');
}
