import "server-only";
import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { identityPool } from "./identity-db";
import { readTrialRange } from "./schedule-trial-data";
import { shiftDate } from "./workweek";
import { todayInOperationsTimeZone } from "./date";
import { driverCalendarConfig, credentialContext } from "./driver-calendar";
import type { CalendarCredentials, GoogleCalendarEvent } from "./driver-calendar-google";

type Connection={tenant_id:string;user_id:string;driver_id:string;credentials_enc:string;status:string};
type StoredEvent={source_key:string;provider_event_id:string;source_hash:string;service_date:string};
const zone="America/Los_Angeles";
const hash=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");

async function tenantWork<T>(tenantId:string,work:(c:PoolClient)=>Promise<T>){
 const c=await identityPool.connect();
 try{await c.query("begin");await c.query("select set_config('kidloop.tenant_id',$1,true)",[tenantId]);const result=await work(c);await c.query("commit");return result;}
 catch(error){await c.query("rollback");throw error;}finally{c.release();}
}

function eventTimes(date:string,start:string,end:string){
 const startValue=`${date}T${start.slice(0,5)}:00`;
 let endValue=`${date}T${end.slice(0,5)}:00`;
 if(end<=start){const d=new Date(`${date}T${start.slice(0,5)}:00Z`);d.setUTCMinutes(d.getUTCMinutes()+30);endValue=d.toISOString().slice(0,19);}
 return {start:{dateTime:startValue,timeZone:zone},end:{dateTime:endValue,timeZone:zone}};
}

export async function syncDriverCalendars(filter?:{tenantId:string;userId:string}){
 const connections=(await identityPool.query<Connection>(`select c.tenant_id,c.user_id,u.driver_id,c.credentials_enc,c.status
   from driver_calendar_connections c join app_users u on u.id=c.user_id and u.tenant_id=c.tenant_id
   join tenants t on t.id=c.tenant_id where c.status='CONNECTED' and u.active and u.role='DRIVER' and u.driver_id is not null and t.active
   and ($1::uuid is null or c.tenant_id=$1) and ($2::uuid is null or c.user_id=$2)`,[filter?.tenantId??null,filter?.userId??null])).rows;
 const today=todayInOperationsTimeZone(),dates=Array.from({length:35},(_,i)=>shiftDate(today,i));
 let synced=0;
 for(const tenantId of [...new Set(connections.map(c=>c.tenant_id))]){
  const group=connections.filter(c=>c.tenant_id===tenantId);
  await tenantWork(tenantId,async c=>{
   const {days}=await readTrialRange(c,dates,true);
   for(const connection of group){
    const {provider,vault,origin}=driverCalendarConfig();
    try{
     const refreshed=await provider.refresh(vault.open<CalendarCredentials>(connection.credentials_enc,credentialContext(tenantId,connection.user_id)));
     await c.query("update driver_calendar_connections set credentials_enc=$3,updated_at=now() where tenant_id=$1 and user_id=$2",[tenantId,connection.user_id,vault.seal(refreshed.credentials,credentialContext(tenantId,connection.user_id))]);
     const wanted=new Map<string,{event:GoogleCalendarEvent;digest:string;date:string}>();
     for(const day of days)for(const plan of day.plans.filter(p=>p.driverId===connection.driver_id)){
      const sourceKey=`${day.date}:${plan.routeId}:${plan.stops[0]?.time??""}`;
      const event:GoogleCalendarEvent={summary:`KidLoop · ${plan.name}`,description:`${plan.students.length} students\n${plan.stops.map(s=>`${s.time} ${s.name}`).join("\n")}`,
       ...eventTimes(day.date,plan.stops[0].time,plan.stops.at(-1)!.time),source:{title:"Open in KidLoop",url:`${origin}/driver/week?week=${day.date}&day=${day.date}`}};
      wanted.set(sourceKey,{event,digest:hash(event),date:day.date});
     }
     const stored=(await c.query<StoredEvent>(`select source_key,provider_event_id,source_hash,service_date::text from driver_calendar_events
       where user_id=$1 and service_date between $2 and $3`,[connection.user_id,dates[0],dates.at(-1)])).rows;
     for(const row of stored.filter(row=>!wanted.has(row.source_key))){await provider.remove(refreshed.accessToken,row.provider_event_id);await c.query("delete from driver_calendar_events where user_id=$1 and source_key=$2",[connection.user_id,row.source_key]);}
     for(const [sourceKey,item] of wanted){
      const old=stored.find(row=>row.source_key===sourceKey);let eventId=old?.provider_event_id;
      if(!old)eventId=await provider.create(refreshed.accessToken,item.event);
      else if(old.source_hash!==item.digest&&!(await provider.update(refreshed.accessToken,eventId!,item.event)))eventId=await provider.create(refreshed.accessToken,item.event);
      if(!old||old.source_hash!==item.digest)await c.query(`insert into driver_calendar_events(user_id,source_key,provider_event_id,source_hash,service_date)
        values($1,$2,$3,$4,$5) on conflict(tenant_id,user_id,source_key) do update set provider_event_id=excluded.provider_event_id,source_hash=excluded.source_hash,service_date=excluded.service_date,updated_at=now()`,[connection.user_id,sourceKey,eventId,item.digest,item.date]);
     }
     synced++;
    }catch(error){if(error instanceof Error&&error.message==="RECONNECT")await c.query("update driver_calendar_connections set status='RECONNECT',updated_at=now() where user_id=$1",[connection.user_id]);}
   }
  });
 }
 return {connections:synced};
}
