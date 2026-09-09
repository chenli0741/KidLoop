import 'server-only';
import type { PoolClient } from 'pg';
import type { AuthUser, Trip, Rider } from './types';
import type { RouteStop } from './fixed-route-types';
import { overCapacity } from './route-plan';
import { displayedStudentPhoto } from './photo-display';

// Caller supplies authorized trips. The canonical assignment is never duplicated.
export async function addSharedRiders(c: Pick<PoolClient,'query'>, trips: Trip[], user: AuthUser) {
  if (!trips.length) return trips;
  const rows = (await c.query(`select m.trip_id, m.pickup_stop_id,m.dropoff_stop_id,ts.id,ts.trip_id as owner_id,ts.status,
    s.id as student_id,s.name,s.photo_url,s.grade,s.age,s.classroom_name,
    case when $2::boolean then coalesce(p.name,'') else '' end as parent_name,
    case when $2::boolean then coalesce(p.phone,'') else '' end as parent_phone,
    coalesce(dp.note,'') as parent_note,coalesce(dp.absent,false) as parent_absent,v.name as vehicle_name
    from shared_pickup_members m join trip_students ts on ts.id=m.assignment_id
    join students s on s.id=ts.student_id join trips owner on owner.id=ts.trip_id
    join driver_shifts sh on sh.id=owner.shift_id join vehicles v on v.id=sh.vehicle_id
    left join parents p on p.id=s.parent_id
    left join student_day_plans dp on dp.student_id=s.id and dp.service_date=owner.scheduled_date
    where m.trip_id=any($1::uuid[])`,[trips.map(t=>t.id),user.role==='ADMIN'])).rows;
  return trips.map(trip=>{
    const shared=rows.filter(r=>r.trip_id===trip.id);
    const ids=new Set(shared.map(r=>r.id));
    const riders: Rider[]=shared.map(r=>({id:r.id,studentId:r.student_id,name:r.name,photoUrl:displayedStudentPhoto(user,r.photo_url),
      grade:r.grade,age:r.age,classroomName:r.classroom_name,parentName:r.parent_name,parentPhone:r.parent_phone,
      parentNote:r.parent_note,parentAbsent:r.parent_absent,status:r.status,pickupStopId:r.pickup_stop_id,dropoffStopId:r.dropoff_stop_id,
      shared:true,otherVehicle:r.owner_id!==trip.id && r.status!=='SCHEDULED' ? r.vehicle_name:undefined}));
    return {...trip,hasSharedPickups:shared.length>0,riders:[...trip.riders.filter(r=>!ids.has(r.id)),...riders]};
  });
}

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

export async function claimSharedPickup(c:PoolClient,user:AuthUser,assignmentId:string,targetId:string,nextStatus:string) {
  const row=(await c.query(`select ts.trip_id,ts.status,m.pickup_stop_id,m.dropoff_stop_id,t.route_stops,t.status as trip_status,v.capacity
    from shared_pickup_members m join trip_students ts on ts.id=m.assignment_id join trips t on t.id=m.trip_id
    join driver_shifts sh on sh.id=t.shift_id join vehicles v on v.id=sh.vehicle_id
    where m.assignment_id=$1 and m.trip_id=$2 and t.operating_term_id=current_operating_term()
    and ($3::uuid is null or sh.driver_id=$3)`,[assignmentId,targetId,user.role==='DRIVER'?user.driverId:null])).rows[0];
  if(!row)throw new Error('Assignment unavailable');
  if(row.trip_id!==targetId && (row.status!=='SCHEDULED'||nextStatus!=='PICKED_UP'))throw new Error('ALREADY_CLAIMED');
  if((await c.query('select 1 from trip_segment_completions where trip_id=$1 and pickup_stop_id=$2 and dropoff_stop_id=$3',[targetId,row.pickup_stop_id,row.dropoff_stop_id])).rowCount && !(row.status==='DROPPED_OFF'&&nextStatus==='PICKED_UP'&&row.trip_id===targetId))throw new Error('Segment already completed');
  if(['DRAFT','CANCELED'].includes(row.trip_status)||(row.trip_status==='COMPLETED'&&!(row.status==='DROPPED_OFF'&&nextStatus==='PICKED_UP'&&row.trip_id===targetId)))throw new Error('Trip is not active');
  if(nextStatus==='PICKED_UP') {
    // Fixed riders reserve seats, including those at later stops. Unclaimed shared riders do not.
    const riders=(await c.query(`select ts.student_id as "studentId",ts.pickup_stop_id as "pickupStopId",ts.dropoff_stop_id as "dropoffStopId"
      from trip_students ts where trip_id=$1 and ts.id<>$2 and ts.status not in ('ABSENT','EXCEPTION')
      and (ts.status<>'SCHEDULED' or not exists(select 1 from shared_pickup_members m where m.assignment_id=ts.id))`,[targetId,assignmentId])).rows;
    riders.push({studentId:assignmentId,pickupStopId:row.pickup_stop_id,dropoffStopId:row.dropoff_stop_id});
    if(overCapacity(row.route_stops,riders,row.capacity))throw new Error('CAPACITY_EXCEEDED');
  }
  if(row.trip_id!==targetId) {
    await c.query('update trip_students set trip_id=$2,pickup_stop_id=$3,dropoff_stop_id=$4 where id=$1',[assignmentId,targetId,row.pickup_stop_id,row.dropoff_stop_id]);
  }
  return row.trip_id as string;
}
