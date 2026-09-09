import type {PoolClient} from 'pg';
import type {AuthUser} from '../../src/lib/types';
import type {RouteStop} from '../../src/lib/fixed-route-types';
export async function sharePickupSchool(c:PoolClient,user:AuthUser,tripIds:string[],schoolId:string) {
  if(user.role!=='ADMIN'||tripIds.length!==2||tripIds[0]===tripIds[1])throw new Error('Select two trips');
  await c.query('select pg_advisory_xact_lock(70919009)');
  const trips=(await c.query(`select t.*,sh.vehicle_id from trips t join driver_shifts sh on sh.id=t.shift_id
    where t.id=any($1::uuid[]) and t.operating_term_id=current_operating_term() order by t.id for update of t`,[tripIds])).rows;
  if(trips.length!==2||trips.some(t=>t.status!=='PUBLISHED')||String(trips[0].scheduled_date)!==String(trips[1].scheduled_date))throw new Error('Select two unstarted trips on the same day');
  if((await c.query(`select 1 from trip_students where trip_id=any($1::uuid[]) and (status<>'SCHEDULED' or picked_up_at is not null)
    union all select 1 from shared_pickup_members where trip_id=any($1::uuid[])`,[tripIds])).rowCount)throw new Error('Trips already started or shared');
  const members=(await c.query(`select ts.id,ts.student_id,s.program_id from trip_students ts join students s on s.id=ts.student_id
    where ts.trip_id=any($1::uuid[]) and s.school_id=$2`,[tripIds,schoolId])).rows;
  if(!members.length||new Set(members.map(m=>m.student_id)).size!==members.length)throw new Error('Missing or duplicate riders');
  for(const t of trips) {
    const stops=t.route_stops as RouteStop[]|null;
    for(const m of members){
      const pickup=stops?.find(s=>s.schoolId===schoolId),dropoff=stops?.find(s=>s.programId===m.program_id);
      if(!pickup||!dropoff||stops!.indexOf(pickup)>=stops!.indexOf(dropoff))throw new Error('Both trips must visit the pickup school and destination');
      await c.query('insert into shared_pickup_members values($1,$2,$3,$4)',[m.id,t.id,pickup.id,dropoff.id]);
    }
  }
}
