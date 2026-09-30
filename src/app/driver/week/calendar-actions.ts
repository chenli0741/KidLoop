"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { startDriverCalendar,finishDriverCalendar,disconnectDriverCalendar } from "@/lib/driver-calendar";
import { syncDriverCalendars } from "@/lib/driver-calendar-sync";

const failure=(error:unknown)=>({ok:false as const,error:error instanceof Error?error.message:"GOOGLE_ERROR"});
export async function connectDriverCalendar(native:boolean){const user=await requireUser(["DRIVER"],true);try{return {ok:true as const,...await startDriverCalendar(user,native)};}catch(error){return failure(error);}}
export async function completeDriverCalendar(state:string,proof:string){const user=await requireUser(["DRIVER"],true);try{const email=await finishDriverCalendar(user,state,proof);await syncDriverCalendars({tenantId:user.tenantId!,userId:user.id});revalidatePath("/driver/week");return {ok:true as const,email};}catch(error){return failure(error);}}
export async function disconnectCalendar(revision:string){const user=await requireUser(["DRIVER"],true);try{await disconnectDriverCalendar(user,revision);revalidatePath("/driver/week");return {ok:true as const};}catch(error){return failure(error);}}
export async function syncCalendarNow(){const user=await requireUser(["DRIVER"],true);try{await syncDriverCalendars({tenantId:user.tenantId!,userId:user.id});return {ok:true as const};}catch(error){return failure(error);}}
