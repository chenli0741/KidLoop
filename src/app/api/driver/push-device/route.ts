import { requireUser } from "@/lib/auth";
import { identityTransaction } from "@/lib/identity-db";
export const runtime="nodejs";
export async function POST(request:Request){
 const user=await requireUser(["DRIVER"],true);if(!user.driverId)return Response.json({ok:false},{status:403});
 const body=await request.json().catch(()=>null) as {installationId?:string;token?:string;environment?:string}|null;
 if(!body||!/^[a-f\d-]{36}$/i.test(body.installationId??"")||!/^[a-f\d]{64,200}$/i.test(body.token??"")||!['sandbox','production'].includes(body.environment??""))return Response.json({ok:false},{status:400});
 await identityTransaction(async c=>{
  const membership=await c.query("select 1 from app_users where id=$1 and tenant_id=$2 and account_id=$3 and driver_id=$4 and role='DRIVER' and active",[user.id,user.tenantId,user.accountId,user.driverId]);
  if(!membership.rowCount)throw new Error("FORBIDDEN");
  await c.query("delete from driver_push_devices where token=$1 and (tenant_id<>$2 or installation_id<>$3)",[body.token,user.tenantId,body.installationId]);
  await c.query(`insert into driver_push_devices(tenant_id,user_id,installation_id,token,environment) values($1,$2,$3,$4,$5)
   on conflict(tenant_id,installation_id) do update set user_id=excluded.user_id,token=excluded.token,environment=excluded.environment,active=true,last_seen_at=now()`,[user.tenantId,user.id,body.installationId,body.token,body.environment]);
 });
 return Response.json({ok:true},{headers:{"Cache-Control":"no-store"}});
}
