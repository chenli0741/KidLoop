import { get } from "@vercel/blob";
import { getUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { photoAccessSql, photoPath } from "@/lib/student-photos";
export const runtime="nodejs";
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}) {
  const user=await getUser();if(!user)return new Response(null,{status:401});
  const {id}=await params;if(!photoPath.test(`/api/photos/${id}`))return new Response(null,{status:404});
  const result=await query<{blob_url:string}>(photoAccessSql,[id,user.id,user.role,user.driverId]);
  if(!result.rowCount)return new Response(null,{status:404});
  try {
    const blob=await get(result.rows[0].blob_url,{access:"private"});
    if(!blob || blob.statusCode!==200)return new Response(null,{status:404});
    return new Response(blob.stream,{headers:{"Content-Type":"image/jpeg","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
  }catch{return new Response(null,{status:503});}
}
