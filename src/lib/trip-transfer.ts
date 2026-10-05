import 'server-only';
import type {PoolClient} from 'pg';
import {lockRoutes} from './fixed-routes';
import type {AuthUser} from './types';

type TransferTrip={
 id:string;shift_id:string;status:string;scheduled_date:string;start_time:string;end_time:string;
 driver_id:string;vehicle_id:string;
};
export type TransferDriver={id:string;name:string};

async function readTransferTrip(c:PoolClient,user:AuthUser,tripId:string,lock=false){
 const result=await c.query<TransferTrip>(`select t.id,t.shift_id,t.status,t.scheduled_date::text,
   to_char(sh.start_time,'HH24:MI') as start_time,to_char(sh.end_time,'HH24:MI') as end_time,
   sh.driver_id,sh.vehicle_id
   from trips t join driver_shifts sh on sh.id=t.shift_id
   where t.id=$1 and t.operating_term_id=current_operating_term()
   and t.status in ('PUBLISHED','NEEDS_ATTENTION')
   and not exists(select 1 from trip_stop_events e where e.trip_id=t.id)
   and not exists(select 1 from trip_students x where x.trip_id=t.id and x.status in ('PICKED_UP','DROPPED_OFF'))
   and ($2::uuid is null or sh.driver_id=$2)
   ${lock?'for update of t,sh':''}`,[tripId,user.role==='DRIVER'?user.driverId:null]);
 if(!result.rowCount)throw new Error('Trip unavailable for transfer.');
 return result.rows[0];
}

async function candidateDrivers(c:PoolClient,trip:TransferTrip){
 return (await c.query<TransferDriver>(`
  select d.id,d.name from drivers d where d.active and d.id<>$1
   and exists(select 1 from app_users u where u.driver_id=d.id and u.role='DRIVER' and u.active)
  order by d.name,d.id`,[trip.driver_id])).rows;
}

export async function listTripTransferDrivers(c:PoolClient,user:AuthUser,tripId:string):Promise<TransferDriver[]>{
 if(!['ADMIN','DRIVER'].includes(user.role)||(user.role==='DRIVER'&&!user.driverId))throw new Error('Trip unavailable for transfer.');
 const trip=await readTransferTrip(c,user,tripId);
 return candidateDrivers(c,trip);
}

export async function transferTripDriver(c:PoolClient,user:AuthUser,tripId:string,toDriverId:string){
 if(!['ADMIN','DRIVER'].includes(user.role)||(user.role==='DRIVER'&&!user.driverId))throw new Error('Trip unavailable for transfer.');
 // Serialize only to prevent materialization from overwriting this ride-level
 // assignment while the transfer is being saved. No scheduling rules are run.
 await lockRoutes(c);
 await c.query('select pg_advisory_xact_lock(hashtextextended($1::text,70919012))',[tripId]);
 const trip=await readTransferTrip(c,user,tripId,true);
 const candidates=await candidateDrivers(c,trip);
 const target=candidates.find(driver=>driver.id===toDriverId);
 if(!target)throw new Error('Selected driver account is no longer active.');
 const tripCount=Number((await c.query("select count(*)::int n from trips where shift_id=$1 and status not in ('DRAFT','CANCELED')",[trip.shift_id])).rows[0].n);
 if(tripCount>1){
  const shift=(await c.query(`insert into driver_shifts(driver_id,vehicle_id,shift_date,start_time,end_time,status)
   values($1,$2,$3,$4,$5,'SCHEDULED') returning id`,
   [toDriverId,trip.vehicle_id,trip.scheduled_date,trip.start_time,trip.end_time])).rows[0].id;
  await c.query('update trips set shift_id=$2,updated_at=clock_timestamp() where id=$1',[tripId,shift]);
 }else{
  await c.query("update driver_shifts set driver_id=$2 where id=$1",[trip.shift_id,toDriverId]);
  await c.query('update trips set updated_at=clock_timestamp() where id=$1',[tripId]);
 }
 await c.query('insert into trip_driver_transfers(trip_id,from_driver_id,to_driver_id,actor_id) values($1,$2,$3,$4)',[tripId,trip.driver_id,toDriverId,user.id]);
 return target;
}
