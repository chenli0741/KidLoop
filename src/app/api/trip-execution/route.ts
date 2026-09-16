import {getUser,assertWorkspaceRequest} from '@/lib/auth';
import {transaction} from '@/lib/db';
import {readTripExecution} from '@/lib/read-trip-execution';

export async function GET(request:Request){
 const user=await getUser();
 if(!user||!['ADMIN','DRIVER'].includes(user.role)||(user.role==='DRIVER'&&!user.driverId))return new Response(null,{status:403});
 try{await assertWorkspaceRequest(user);}catch{return new Response(null,{status:409});}
 const id=new URL(request.url).searchParams.get('trip');
 if(!id||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))return new Response(null,{status:400});
 const execution=await transaction(async c=>{
  const allowed=await c.query(`select t.id from trips t join driver_shifts sh on sh.id=t.shift_id
   where t.id=$1 and t.operating_term_id=current_operating_term() and t.status<>'DRAFT'
   and ($2::uuid is null or sh.driver_id=$2)`,[id,user.role==='DRIVER'?user.driverId:null]);
  return allowed.rowCount?readTripExecution(c,id):null;
 });
 return execution?Response.json(execution,{headers:{'Cache-Control':'private, no-store'}}):new Response(null,{status:404});
}
