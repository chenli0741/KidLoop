import {getUser,assertWorkspaceRequest} from '@/lib/auth';
import {transaction} from '@/lib/db';
import {advanceTripStopRecord} from '@/lib/advance-trip-stop';

export const runtime='nodejs';
const uuid=/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const actions=new Set(['GO','ARRIVE','DROP_OFF'] as const);

export async function POST(request:Request){
 const startedAt=Date.now();
 const user=await getUser();
 if(!user||!['ADMIN','DRIVER'].includes(user.role)||(user.role==='DRIVER'&&!user.driverId))return new Response(null,{status:403});
 try{await assertWorkspaceRequest(user,true);}catch{return Response.json({error:'Workspace changed. Reload.'},{status:409});}
 if(request.headers.get('origin')!==new URL(request.url).origin)return new Response(null,{status:403});
 try{
  const raw=await request.text();
  if(raw.length>12000)throw new Error('Invalid request');
  const input=JSON.parse(raw) as {tripId?:unknown;action?:unknown;location?:unknown};
  if(typeof input.tripId!=='string'||!uuid.test(input.tripId)||typeof input.action!=='string'||!actions.has(input.action as 'GO'|'ARRIVE'|'DROP_OFF'))throw new Error('Invalid request');
  const result=await transaction(client=>advanceTripStopRecord(client,user,input.tripId as string,input.action as 'GO'|'ARRIVE'|'DROP_OFF',input.location));
  console.log(JSON.stringify({level:'info',message:'Trip stop updated',operation:'updateTripStopApi',durationMs:Date.now()-startedAt,action:input.action}));
  return Response.json(result,{headers:{'Cache-Control':'private, no-store'}});
 }catch(error){
  console.error(JSON.stringify({level:'error',message:'Trip stop update failed',operation:'updateTripStopApi',durationMs:Date.now()-startedAt,error:error instanceof Error?error.message:String(error)}));
  return Response.json({error:'Trip stop update was not confirmed'},{status:409,headers:{'Cache-Control':'private, no-store'}});
 }
}
