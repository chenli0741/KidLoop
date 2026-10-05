import {getUser,assertWorkspaceRequest} from '@/lib/auth';
import {transaction} from '@/lib/db';
import {listTripTransferDrivers,transferTripDriver} from '@/lib/trip-transfer';

const uuid=/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
async function actor(mutation=false){
 const user=await getUser();
 if(!user||!['ADMIN','DRIVER'].includes(user.role)||(user.role==='DRIVER'&&!user.driverId))return null;
 try{await assertWorkspaceRequest(user,mutation);return user;}catch{return null;}
}
export async function GET(request:Request){
 const user=await actor();if(!user)return new Response(null,{status:403});
 const tripId=new URL(request.url).searchParams.get('trip');
 if(!tripId||!uuid.test(tripId))return new Response(null,{status:400});
 try{return Response.json({drivers:await transaction(c=>listTripTransferDrivers(c,user,tripId))},{headers:{'Cache-Control':'private, no-store'}});}
 catch{return Response.json({error:'Trip unavailable for transfer.'},{status:409});}
}
export async function POST(request:Request){
 const user=await actor(true);if(!user)return new Response(null,{status:403});
 if(request.headers.get('origin')!==new URL(request.url).origin)return new Response(null,{status:403});
 try{
  const input=await request.json() as {tripId?:unknown;driverId?:unknown};
  if(typeof input.tripId!=='string'||!uuid.test(input.tripId)||typeof input.driverId!=='string'||!uuid.test(input.driverId))throw new Error('Invalid request');
  const driver=await transaction(c=>transferTripDriver(c,user,input.tripId as string,input.driverId as string));
  return Response.json({driver},{headers:{'Cache-Control':'private, no-store'}});
 }catch(error){return Response.json({error:error instanceof Error?error.message:'Transfer failed.'},{status:409,headers:{'Cache-Control':'private, no-store'}});}
}
