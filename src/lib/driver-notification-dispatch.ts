import "server-only";
import type { PoolClient } from "pg";
import { identityPool } from "./identity-db";
import { readTrialRange } from "./schedule-trial-data";
import { sendApns } from "./apns";

type Device={tenant_id:string;user_id:string;installation_id:string;token:string;environment:"sandbox"|"production";driver_id:string};
type Ride={key:string;routeKey:string|null;driverId:string;name:string;time:string;status:string};
const localParts=(now:Date)=>Object.fromEntries(new Intl.DateTimeFormat("en-CA",{timeZone:"America/Los_Angeles",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(now).filter(p=>p.type!=="literal").map(p=>[p.type,p.value]));
async function tenantWork<T>(tenantId:string,work:(c:PoolClient)=>Promise<T>){const c=await identityPool.connect();try{await c.query("begin");await c.query("select set_config('kidloop.tenant_id',$1,true)",[tenantId]);const value=await work(c);await c.query("commit");return value;}catch(error){await c.query("rollback");throw error;}finally{c.release();}}

async function deliver(c:PoolClient,device:Device,key:string,payload:{title:string;body:string;path:string}){
 const claimed=await c.query(`insert into driver_notification_deliveries(tenant_id,user_id,installation_id,notification_key) values($1,$2,$3,$4)
   on conflict(tenant_id,installation_id,notification_key) do update set status='SENDING',attempts=driver_notification_deliveries.attempts+1,updated_at=now()
   where driver_notification_deliveries.status='FAILED' and driver_notification_deliveries.attempts<3 and driver_notification_deliveries.updated_at<now()-interval '2 minutes'
   returning notification_key`,[device.tenant_id,device.user_id,device.installation_id,key]);
 if(!claimed.rowCount)return false;
 try{const result=await sendApns(device.token,device.environment,payload);const success=result.status===200;await c.query("update driver_notification_deliveries set status=$5,provider_status=$6,updated_at=now() where tenant_id=$1 and user_id=$2 and installation_id=$3 and notification_key=$4",[device.tenant_id,device.user_id,device.installation_id,key,success?"SENT":"FAILED",result.status]);if(result.status===410||result.reason==="Unregistered")await c.query("update driver_push_devices set active=false where tenant_id=$1 and installation_id=$2",[device.tenant_id,device.installation_id]);return success;}
 catch{await c.query("update driver_notification_deliveries set status='FAILED',updated_at=now() where tenant_id=$1 and user_id=$2 and installation_id=$3 and notification_key=$4",[device.tenant_id,device.user_id,device.installation_id,key]);return false;}
}

export async function dispatchDriverNotifications(now=new Date()){
 const parts=localParts(now),date=`${parts.year}-${parts.month}-${parts.day}`,hour=Number(parts.hour),minute=Number(parts.minute);
 const devices=(await identityPool.query<Device>(`select p.tenant_id,p.user_id,p.installation_id,p.token,p.environment,u.driver_id
   from driver_push_devices p join app_users u on u.id=p.user_id and u.tenant_id=p.tenant_id join tenants t on t.id=p.tenant_id
   where p.active and p.last_seen_at>now()-interval '120 days' and u.active and u.role='DRIVER' and u.driver_id is not null and t.active`)).rows;
 let sent=0;
 for(const tenantId of [...new Set(devices.map(d=>d.tenant_id))])await tenantWork(tenantId,async c=>{
  const day=(await readTrialRange(c,[date],true)).days[0];if(!day)return;
  const actual=(await c.query<Ride>(`select t.id::text as key,coalesce(t.generated_plan_id,t.fixed_route_id)::text as "routeKey",sh.driver_id as "driverId",coalesce(nullif(t.route_name,''),coalesce(sc.short_name,sc.name,'接送行程')) as name,
    t.status,
    to_char(coalesce(nullif(t.route_stops->0->>'time','')::time,t.departure_time),'HH24:MI') as time
    from trips t join driver_shifts sh on sh.id=t.shift_id left join schools sc on sc.id=t.school_id
    where t.operating_term_id=current_operating_term() and t.scheduled_date=$1 and t.status<>'DRAFT' order by t.departure_time,t.id`,[date])).rows;
  const materializedRoutes=new Set(actual.map(ride=>ride.routeKey).filter((key):key is string=>!!key));
  for(const device of devices.filter(d=>d.tenant_id===tenantId)){
   const materialized=actual.filter(p=>p.driverId===device.driver_id&&p.status!=="CANCELED");
   const planned=day.plans.filter(p=>p.driverId===device.driver_id&&!materializedRoutes.has(p.routeId)).map(p=>({key:p.routeId,routeKey:p.routeId,driverId:p.driverId,name:p.name,time:p.stops[0].time,status:"PLANNED"}));
   const rides=[...materialized,...planned].sort((a,b)=>a.time.localeCompare(b.time));if(!rides.length)continue;
   if(hour===9&&minute<5){const first=rides[0];if(await deliver(c,device,`daily:${date}`,{title:"您今天有接送行程",body:`共 ${rides.length} 趟，第一趟 ${first.time} · ${first.name}`,path:`/driver?date=${date}&week=${date}`}))sent++;}
   const current=hour*60+minute;
   for(const ride of rides){const [h,m]=ride.time.split(":").map(Number);if(h*60+m-current<59||h*60+m-current>60)continue;
    if(await deliver(c,device,`ride:${date}:${ride.key}:${ride.time}`,{title:"行程将在一小时后开始",body:`${ride.time} · ${ride.name}`,path:`/driver?date=${date}&week=${date}`}))sent++;}
  }
 });
 return{sent,date,time:`${parts.hour}:${parts.minute}`};
}
