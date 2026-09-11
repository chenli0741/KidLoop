import 'server-only';
import type { PoolClient } from 'pg';
import type { AuthUser, Trip, Rider } from './types';
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
  const allSharedTripIds = [...new Set(rows.flatMap(row => [row.trip_id, row.owner_id]))];
  const capacityRows = allSharedTripIds.length ? (await c.query<{id:string;capacity:number;fixed:number}>(`select t.id,v.capacity,
    count(ts.id) filter (where ts.status not in ('ABSENT','EXCEPTION') and not exists(select 1 from shared_pickup_members x where x.assignment_id=ts.id))::int as fixed
    from trips t join driver_shifts sh on sh.id=t.shift_id join vehicles v on v.id=sh.vehicle_id
    left join trip_students ts on ts.trip_id=t.id where t.id=any($1::uuid[]) group by t.id,v.capacity`,[allSharedTripIds])).rows : [];
  const capacityByTrip = new Map(capacityRows.map(row => [row.id, { capacity: row.capacity, fixed: row.fixed }]));
  const baseByTrip = new Map(trips.map(trip => [trip.id, trip]));
  const participants = new Map<string, Set<string>>();
  for (const row of rows) {
    const set = participants.get(row.id) ?? new Set<string>();
    set.add(row.trip_id);
    set.add(row.owner_id);
    participants.set(row.id, set);
  }
  return trips.map(trip=>{
    const shared=rows.filter(r=>r.trip_id===trip.id);
    const ids=new Set(shared.map(r=>r.id));
    const riders: Rider[]=shared.map(r=>({id:r.id,studentId:r.student_id,name:r.name,photoUrl:displayedStudentPhoto(user,r.photo_url),
      grade:r.grade,age:r.age,classroomName:r.classroom_name,parentName:r.parent_name,parentPhone:r.parent_phone,
      parentNote:r.parent_note,parentAbsent:r.parent_absent,status:r.status,pickupStopId:r.pickup_stop_id,dropoffStopId:r.dropoff_stop_id,
      shared:true,otherVehicle:r.owner_id!==trip.id && r.status!=='SCHEDULED' ? r.vehicle_name:undefined}));
    if (!shared.length) return {...trip,riders:[...trip.riders.filter(r=>!ids.has(r.id)),...riders]};
    const sharedCount = new Set(shared.map(r => r.id)).size;
    const capacityLeft = (candidate: Trip) => candidate.capacity - candidate.riders.filter(r => !r.shared && !r.otherVehicle && !['ABSENT','EXCEPTION'].includes(r.status)).length;
    const availableElsewhere = [...new Set(shared.flatMap(r => [...(participants.get(r.id) ?? [])]))]
      .filter(id => id !== trip.id && (baseByTrip.has(id) || capacityByTrip.has(id)))
      .reduce((sum, id) => {
        const capacity = capacityByTrip.get(id);
        return sum + Math.max(0, capacity ? capacity.capacity - capacity.fixed : capacityLeft(baseByTrip.get(id)!));
      }, 0);
    return {...trip,hasSharedPickups:true,sharedPickupMin:Math.max(0,sharedCount-availableElsewhere),sharedPickupMax:Math.min(sharedCount,Math.max(0,capacityLeft(trip))),riders:[...trip.riders.filter(r=>!ids.has(r.id)),...riders]};
  });
}

export async function claimSharedPickup(c:PoolClient,user:AuthUser,assignmentId:string,targetId:string,nextStatus:string) {
  const row=(await c.query(`select ts.trip_id,ts.status,m.pickup_stop_id,m.dropoff_stop_id,t.route_stops,t.status as trip_status,v.capacity
    from shared_pickup_members m join trip_students ts on ts.id=m.assignment_id join trips t on t.id=m.trip_id
    join driver_shifts sh on sh.id=t.shift_id join vehicles v on v.id=sh.vehicle_id
    where m.assignment_id=$1 and m.trip_id=$2 and t.operating_term_id=current_operating_term()
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
    await c.query('update trip_students set trip_id=$2,pickup_stop_id=$3,dropoff_stop_id=$4 where id=$1',[assignmentId,targetId,row.pickup_stop_id,row.dropoff_stop_id]);
  }
  return row.trip_id as string;
}
