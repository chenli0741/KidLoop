import 'server-only';
import type {PoolClient} from 'pg';
import type {AuthUser} from '../types';
import {changeRiderStatus} from '../rider-status';
import {readTripExecution} from '../read-trip-execution';
export async function confirmCameraPickup(c:PoolClient,user:AuthUser,tripId:string,ids:string[],location?:unknown){
 const uuid=/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
 if(user.role!=='DRIVER'||!user.driverId||!uuid.test(tripId)||!Array.isArray(ids)||!ids.length||ids.length>30||new Set(ids).size!==ids.length||ids.some(id=>!uuid.test(id)))throw new Error('Invalid pickup selection');
 await c.query('select pg_advisory_xact_lock(70919009)');
 const trip=(await c.query(`select t.id from trips t join driver_shifts sh on sh.id=t.shift_id where t.id=$1 and sh.driver_id=$2 and t.operating_term_id=current_operating_term() and t.status not in ('DRAFT','CANCELED','COMPLETED')`,[tripId,user.driverId])).rows[0];
 if(!trip)throw new Error('Trip unavailable');
 for(const id of ids){
  const r=(await c.query(`select ts.status,ts.parent_absence,exists(select 1 from shared_pickup_members where assignment_id=ts.id) as shared,
   exists(select 1 from trip_segment_completions sc where sc.trip_id=$2 and sc.pickup_stop_id=coalesce(m.pickup_stop_id,ts.pickup_stop_id) and sc.dropoff_stop_id=coalesce(m.dropoff_stop_id,ts.dropoff_stop_id)) as completed
   from trip_students ts left join shared_pickup_members m on m.assignment_id=ts.id and m.trip_id=$2
   where ts.id=$1 and (ts.trip_id=$2 or m.trip_id=$2)`,[id,tripId])).rows[0];
  if(!r||r.status!=='SCHEDULED'||r.parent_absence||r.completed)throw new Error('Manifest changed. Refresh and try again.');
  await changeRiderStatus(c,user,id,'PICKED_UP',undefined,r.shared?tripId:undefined,location);
 }
 return readTripExecution(c,tripId);
}
