import {getUser,assertWorkspaceRequest} from '@/lib/auth';
import {transaction} from '@/lib/db';
import {changeRiderStatus} from '@/lib/rider-status';
import {readTripExecution} from '@/lib/read-trip-execution';
import type {RiderStatus} from '@/lib/types';
import type {MissedPickupDetails} from '@/lib/missed-pickup';

export const runtime='nodejs';
const uuid=/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const statuses=new Set<RiderStatus>(['SCHEDULED','PICKED_UP','DROPPED_OFF','ABSENT','EXCEPTION']);

export async function POST(request:Request){
  const startedAt=Date.now();
  const user=await getUser();
  if(!user||!['ADMIN','DRIVER'].includes(user.role)||(user.role==='DRIVER'&&!user.driverId))return new Response(null,{status:403});
  try{await assertWorkspaceRequest(user,true);}catch{return Response.json({error:'Workspace changed. Reload.'},{status:409});}
  if(request.headers.get('origin')!==new URL(request.url).origin)return new Response(null,{status:403});
  try{
    const raw=await request.text();
    if(raw.length>12000)throw new Error('Invalid request');
    const input=JSON.parse(raw) as {assignmentId?:unknown;nextStatus?:unknown;details?:unknown;targetTripId?:unknown;location?:unknown};
    if(typeof input.assignmentId!=='string'||!uuid.test(input.assignmentId)||typeof input.nextStatus!=='string'||!statuses.has(input.nextStatus as RiderStatus)||
      (input.targetTripId!==undefined&&(typeof input.targetTripId!=='string'||!uuid.test(input.targetTripId))))throw new Error('Invalid request');
    let details:MissedPickupDetails|undefined;
    if(input.details!==undefined){
      const value=input.details as {reason?:unknown;parentNotified?:unknown};
      if(!value||typeof value!=='object'||typeof value.reason!=='string'||!value.reason.trim()||value.reason.length>100||
        (value.parentNotified!==undefined&&typeof value.parentNotified!=='boolean'))throw new Error('Invalid request');
      details={reason:value.reason,parentNotified:value.parentNotified as boolean|undefined};
    }
    const result=await transaction(async client=>{
      const tripId=await changeRiderStatus(client,user,input.assignmentId as string,input.nextStatus as RiderStatus,details,input.targetTripId as string|undefined,input.location);
      return readTripExecution(client,tripId);
    });
    console.log(JSON.stringify({level:'info',message:'Rider status updated',operation:'updateRiderStatusApi',durationMs:Date.now()-startedAt,shared:Boolean(input.targetTripId),nextStatus:input.nextStatus}));
    return Response.json(result,{headers:{'Cache-Control':'private, no-store'}});
  }catch(error){
    console.error(JSON.stringify({level:'error',message:'Rider status update failed',operation:'updateRiderStatusApi',durationMs:Date.now()-startedAt,error:error instanceof Error?error.message:String(error)}));
    return Response.json({error:'Rider status update was not confirmed'},{status:409,headers:{'Cache-Control':'private, no-store'}});
  }
}
