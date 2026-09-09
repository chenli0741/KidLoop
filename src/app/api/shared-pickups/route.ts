import { getUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { addSharedRiders } from '@/lib/shared-pickups';
import type { Trip } from '@/lib/types';
export async function GET(request:Request) {
 const user=await getUser();
 if(!user||!['ADMIN','DRIVER'].includes(user.role)||(user.role==='DRIVER'&&!user.driverId))return new Response(null,{status:403});
 const id=new URL(request.url).searchParams.get('trip');
 if(!id||!/^[a-f0-9-]{36}$/i.test(id))return new Response(null,{status:400});
 const found=await db.query(`select t.id from trips t join driver_shifts sh on sh.id=t.shift_id
 where t.id=$1 and t.operating_term_id=current_operating_term() and t.status not in ('DRAFT','CANCELED')
 and ($2::uuid is null or sh.driver_id=$2)`,[id,user.role==='DRIVER'?user.driverId:null]);
 if(!found.rowCount)return new Response(null,{status:404});
 const [trip]=await addSharedRiders(db,[{id,riders:[]} as unknown as Trip],user);
 return Response.json(trip.riders,{headers:{'Cache-Control':'private, no-store'}});
}
