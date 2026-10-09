import {getUser,assertWorkspaceRequest} from '@/lib/auth';
import {transaction} from '@/lib/db';
import {confirmCameraPickup} from '@/lib/pickup-camera/confirm';

export const runtime='nodejs';
const uuid=/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;

export async function POST(request:Request){
 const user=await getUser();
 if(!user||user.role!=='DRIVER'||!user.driverId)return new Response(null,{status:403});
 try{await assertWorkspaceRequest(user,true);}catch{return Response.json({error:'Workspace changed. Reload.'},{status:409});}
 if(request.headers.get('origin')!==new URL(request.url).origin)return new Response(null,{status:403});
 try{
  const raw=await request.text();
  if(raw.length>16000)throw new Error('Invalid request');
  const input=JSON.parse(raw) as {tripId?:unknown;ids?:unknown;location?:unknown};
  if(typeof input.tripId!=='string'||!uuid.test(input.tripId)||!Array.isArray(input.ids)||!input.ids.length||input.ids.length>30||input.ids.some(id=>typeof id!=='string'||!uuid.test(id)))throw new Error('Invalid request');
  const result=await transaction(client=>confirmCameraPickup(client,user,input.tripId as string,input.ids as string[],input.location));
  return Response.json(result,{headers:{'Cache-Control':'private, no-store'}});
 }catch{
  return Response.json({error:'Photo pickup was not confirmed'},{status:409,headers:{'Cache-Control':'private, no-store'}});
 }
}
