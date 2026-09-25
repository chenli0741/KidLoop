import type { SqlReader } from "@/lib/sql-reader";
import 'server-only';
import type { PoolClient } from 'pg';
import type { AuthUser, Trip, Rider } from './types';
import { overCapacity } from './route-plan';
import { displayedStudentPhoto, recognitionStudentPhoto } from './photo-display';
import {sharedPickupBounds} from './shared-allocation';

// Caller supplies authorized trips. The canonical assignment is never duplicated.
export async function addSharedRiders(c: SqlReader, trips: Trip[], user: AuthUser) {
  if (!trips.length) return trips;
  // A shared assignment must be visible as shared on both its canonical trip and every
  // participating trip. Previously only the secondary membership was marked shared,
  // so the canonical driver's screen incorrectly treated the whole pool as fixed riders.
  const rows = (await c.query(`with candidates as (
    select ts.trip_id as target_trip_id,ts.id as assignment_id,ts.pickup_stop_id,ts.dropoff_stop_id
    from trip_students ts where ts.trip_id=any($1::uuid[])
      and exists(select 1 from shared_pickup_members m where m.assignment_id=ts.id)
    union
    select m.trip_id,m.assignment_id,m.pickup_stop_id,m.dropoff_stop_id
    from shared_pickup_members m where m.trip_id=any($1::uuid[])
   )
   select c.target_trip_id as trip_id,c.pickup_stop_id,c.dropoff_stop_id,ts.id,ts.trip_id as owner_id,ts.status,
    s.id as student_id,s.name,s.photo_url,(select '/api/student-avatars/'||ca.student_id::text from student_cartoon_avatars ca where ca.student_id=s.id and ca.source_photo_url=coalesce(s.photo_url,'')) as cartoon_url,s.grade,s.age,s.classroom_name,
    case when $2::boolean then coalesce(p.name,'') else '' end as parent_name,
    case when $2::boolean then coalesce(p.phone,'') else '' end as parent_phone,
    coalesce(dp.note,'') as parent_note,coalesce(dp.absent,false) as parent_absent,v.name as vehicle_name
    from candidates c join trip_students ts on ts.id=c.assignment_id
    join students s on s.id=ts.student_id join trips owner on owner.id=ts.trip_id
    join driver_shifts sh on sh.id=owner.shift_id join vehicles v on v.id=sh.vehicle_id
    left join parents p on p.id=s.parent_id
    left join student_day_plans dp on dp.student_id=s.id and dp.service_date=owner.scheduled_date
    order by c.target_trip_id,s.classroom_name,s.name`,[trips.map(t=>t.id),user.role==='ADMIN'])).rows;
  const limitRows = (await c.query<{tripId:string;pickupStopId:string;min:number;max:number;total:number;feasible:boolean}>(`select trip_id as "tripId",pickup_stop_id as "pickupStopId",minimum_riders as min,maximum_riders as max,
    pool_size as total,feasible from shared_pickup_limits where trip_id=any($1::uuid[])`,[trips.map(trip=>trip.id)])).rows;
  return trips.map(trip=>{
    const shared=rows.filter(r=>r.trip_id===trip.id);
    const ids=new Set(shared.map(r=>r.id));
    const riders: Rider[]=shared.map(r=>({id:r.id,studentId:r.student_id,name:r.name,photoUrl:displayedStudentPhoto(user,r.photo_url,r.cartoon_url),recognitionPhotoUrl:recognitionStudentPhoto(user,r.photo_url),
      grade:r.grade,age:r.age,classroomName:r.classroom_name,parentName:r.parent_name,parentPhone:r.parent_phone,
      parentNote:r.parent_note,parentAbsent:r.parent_absent,status:r.status,pickupStopId:r.pickup_stop_id,dropoffStopId:r.dropoff_stop_id,
      shared:true,otherVehicle:r.owner_id!==trip.id && r.status!=='SCHEDULED' ? r.vehicle_name:undefined}));
    if (!shared.length) return {...trip,riders:[...trip.riders.filter(r=>!ids.has(r.id)),...riders]};
    const current=limitRows.find(limit=>limit.tripId===trip.id&&shared.some(r=>r.pickup_stop_id===limit.pickupStopId));
    if(!current)throw new Error('Shared pickup limits were not assigned during scheduling.');
    return {...trip,hasSharedPickups:true,sharedPickupMin:current.min,sharedPickupMax:current.max,sharedPickupTotal:current.total,riders:[...trip.riders.filter(r=>!ids.has(r.id)),...riders]};
  });
}

export async function claimSharedPickup(c:PoolClient,user:AuthUser,assignmentId:string,targetId:string,nextStatus:string) {
  const row=(await c.query(`select ts.trip_id,ts.status,
    ts.pickup_stop_id as owner_pickup_stop_id,ts.dropoff_stop_id as owner_dropoff_stop_id,
    case when ts.trip_id=$2 then ts.pickup_stop_id else m.pickup_stop_id end as pickup_stop_id,
    case when ts.trip_id=$2 then ts.dropoff_stop_id else m.dropoff_stop_id end as dropoff_stop_id,
    t.route_stops,t.status as trip_status,v.capacity
    from trip_students ts
    left join shared_pickup_members m on m.assignment_id=ts.id and m.trip_id=$2
    join trips t on t.id=$2
    join driver_shifts sh on sh.id=t.shift_id join vehicles v on v.id=sh.vehicle_id
    where ts.id=$1 and (ts.trip_id=$2 or m.trip_id is not null)
    and exists(select 1 from shared_pickup_members participant where participant.assignment_id=ts.id)
    and t.operating_term_id=current_operating_term()
    and ($3::uuid is null or sh.driver_id=$3)`,[assignmentId,targetId,user.role==='DRIVER'?user.driverId:null])).rows[0];
  if(!row)throw new Error('Assignment unavailable');
  if(row.trip_id!==targetId && (row.status!=='SCHEDULED'||nextStatus!=='PICKED_UP'))throw new Error('ALREADY_CLAIMED');
  if((await c.query('select 1 from trip_segment_completions where trip_id=$1 and pickup_stop_id=$2 and dropoff_stop_id=$3',[targetId,row.pickup_stop_id,row.dropoff_stop_id])).rowCount)throw new Error('Segment already completed');
  if(['DRAFT','CANCELED','COMPLETED'].includes(row.trip_status))throw new Error('Trip is not active');
  if(nextStatus==='PICKED_UP') {
    // Fixed riders reserve seats, including those at later stops. Unclaimed shared riders do not.
    const riders=(await c.query(`select ts.student_id as "studentId",ts.pickup_stop_id as "pickupStopId",ts.dropoff_stop_id as "dropoffStopId"
      from trip_students ts where trip_id=$1 and ts.id<>$2 and ts.status not in ('ABSENT','EXCEPTION')
      and (ts.status<>'SCHEDULED' or not exists(select 1 from shared_pickup_members m where m.assignment_id=ts.id))`,[targetId,assignmentId])).rows;
    riders.push({studentId:assignmentId,pickupStopId:row.pickup_stop_id,dropoffStopId:row.dropoff_stop_id});
    if(overCapacity(row.route_stops,riders,row.capacity))throw new Error('CAPACITY_EXCEEDED');
  }
  if(row.trip_id!==targetId) {
    // Keep the former owner as a participant after the canonical assignment moves.
    // Otherwise that vehicle loses the rider from its live shared-pool projection.
    await c.query(`insert into shared_pickup_members(assignment_id,trip_id,pickup_stop_id,dropoff_stop_id)
      values($1,$2,$3,$4) on conflict do nothing`,[assignmentId,row.trip_id,row.owner_pickup_stop_id,row.owner_dropoff_stop_id]);
    await c.query('update trip_students set trip_id=$2,pickup_stop_id=$3,dropoff_stop_id=$4 where id=$1',[assignmentId,targetId,row.pickup_stop_id,row.dropoff_stop_id]);
  }
  return row.trip_id as string;
}

export async function sharedPickupDeparture(c:SqlReader,tripId:string,pickupStopId:string){
  const limit=(await c.query<{tripId:string;min:number;max:number;total:number;feasible:boolean}>(`select trip_id as "tripId",minimum_riders as min,maximum_riders as max,pool_size as total,feasible
    from shared_pickup_limits where trip_id=$1 and pickup_stop_id=$2`,[tripId,pickupStopId])).rows[0];
  if(!limit)return null;
  const picked=(await c.query<{count:number}>(`select count(*)::int as count from trip_students ts
    where ts.trip_id=$1 and ts.pickup_stop_id=$2 and ts.status in ('PICKED_UP','DROPPED_OFF')
      and exists(select 1 from shared_pickup_members m where m.assignment_id=ts.id)`,[tripId,pickupStopId])).rows[0]?.count??0;
  return {...limit,picked};
}

/** Persist allocation-time bounds. Driver execution only reads these rows. */
export async function materializeSharedPickupLimits(c:PoolClient,tripIds:string[]){
  if(!tripIds.length)return;
  const pairs=(await c.query<{tripId:string;pickupStopId:string}>(`select distinct trip_id as "tripId",pickup_stop_id as "pickupStopId" from (
    select ts.trip_id,ts.pickup_stop_id from trip_students ts
    where ts.trip_id=any($1::uuid[]) and ts.pickup_stop_id is not null
      and exists(select 1 from shared_pickup_members m where m.assignment_id=ts.id)
    union select m.trip_id,m.pickup_stop_id from shared_pickup_members m where m.trip_id=any($1::uuid[])
   ) candidates`,[tripIds])).rows;
  for(const pair of pairs){
    const pool=(await c.query<{total:number}>(`with pool as (
      select distinct ts.id,ts.status from trip_students ts
      left join shared_pickup_members target on target.assignment_id=ts.id and target.trip_id=$1 and target.pickup_stop_id=$2
      where exists(select 1 from shared_pickup_members any_member where any_member.assignment_id=ts.id)
        and ((ts.trip_id=$1 and ts.pickup_stop_id=$2) or target.assignment_id is not null)
     ) select count(*) filter(where status not in ('ABSENT','EXCEPTION'))::int as total from pool`,[pair.tripId,pair.pickupStopId])).rows[0];
    if(!pool?.total)continue;
    const vehicles=(await c.query<{tripId:string;capacity:number;fixed:number}>(`with pool as (
      select distinct ts.id from trip_students ts
      left join shared_pickup_members target on target.assignment_id=ts.id and target.trip_id=$1 and target.pickup_stop_id=$2
      where exists(select 1 from shared_pickup_members any_member where any_member.assignment_id=ts.id)
        and ((ts.trip_id=$1 and ts.pickup_stop_id=$2) or target.assignment_id is not null)
     ), participants as (
      select ts.trip_id from trip_students ts join pool on pool.id=ts.id
      union select m.trip_id from shared_pickup_members m join pool on pool.id=m.assignment_id
     ) select t.id as "tripId",v.capacity,
      count(ts.id) filter(where ts.status not in ('ABSENT','EXCEPTION') and not exists(select 1 from shared_pickup_members x where x.assignment_id=ts.id))::int as fixed
     from participants p join trips t on t.id=p.trip_id join driver_shifts sh on sh.id=t.shift_id join vehicles v on v.id=sh.vehicle_id
     left join trip_students ts on ts.trip_id=t.id group by t.id,v.capacity`,[pair.tripId,pair.pickupStopId])).rows;
    const bounds=sharedPickupBounds(pool.total,vehicles.map(vehicle=>({tripId:vehicle.tripId,availableSeats:vehicle.capacity-vehicle.fixed})));
    const current=bounds.vehicles.find(vehicle=>vehicle.tripId===pair.tripId);
    if(!current)throw new Error('Unable to allocate shared pickup limits.');
    await c.query(`insert into shared_pickup_limits(trip_id,pickup_stop_id,minimum_riders,maximum_riders,pool_size,feasible)
      values($1,$2,$3,$4,$5,$6) on conflict(tenant_id,trip_id,pickup_stop_id) do update set
      minimum_riders=excluded.minimum_riders,maximum_riders=excluded.maximum_riders,pool_size=excluded.pool_size,
      feasible=excluded.feasible,created_at=clock_timestamp()`,[pair.tripId,pair.pickupStopId,current.min,current.max,pool.total,bounds.feasible]);
  }
}
