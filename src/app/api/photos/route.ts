import { randomUUID } from "node:crypto";
import { put, del } from "@vercel/blob";
import { getUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { normalizePhoto } from "@/lib/student-photos";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const user = await getUser();
  if (!user || !["ADMIN","PARENT"].includes(user.role)) return Response.json({error:"unauthorized"},{status:403});
  const requestUrl = new URL(request.url);
  const origin = request.headers.get("origin");
  const hostOrigin = `${requestUrl.protocol}//${request.headers.get("host")}`;
  if (!origin || (origin !== requestUrl.origin && origin !== hostOrigin)) return Response.json({error:"origin"},{status:403});
  if (!process.env.BLOB_READ_WRITE_TOKEN) return Response.json({error:"storage"},{status:503});
  const size = Number(request.headers.get("content-length") ?? 0);
  if (size > 1_100_000) return Response.json({error:"size"},{status:413});
  let bytes: Buffer;
  try {
    const reader=request.body?.getReader(); if(!reader) throw new Error();
    const chunks:Uint8Array[]=[];let total=0;
    for(;;){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>1_100_000){await reader.cancel();return Response.json({error:"size"},{status:413});}chunks.push(value);}
    const form=await new Request(request.url,{method:"POST",headers:{"content-type":request.headers.get("content-type") ?? ""},body:Buffer.concat(chunks)}).formData();
    const file=form.get("photo");if(!(file instanceof File))throw new Error();
    bytes=await normalizePhoto(Buffer.from(await file.arrayBuffer()));
  } catch {return Response.json({error:"image"},{status:400});}
  const count=await query<{n:number}>("select count(*)::int as n from student_photos where uploaded_by=$1 and created_at>now()-interval '1 day'",[user.id]);
  if(count.rows[0].n>=100) return Response.json({error:"limit"},{status:429});
  const id=randomUUID();let url:string|undefined;
  try {
    const blob=await put(`students/${id}.jpg`,bytes,{access:"private",contentType:"image/jpeg",addRandomSuffix:false});url=blob.url;
    await query("insert into student_photos(id,uploaded_by,blob_url) values($1,$2,$3)",[id,user.id,url]);
    return Response.json({url:`/api/photos/${id}`},{headers:{"Cache-Control":"no-store"}});
  }catch{if(url)await del(url).catch(()=>{});return Response.json({error:"upload"},{status:503});}
}
