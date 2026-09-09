import 'server-only';
import type {PoolClient} from 'pg';
import type {FixedRoute} from './fixed-route-types';
import {sharedCapacity,sharedRouteRosters,type RouteSharing} from './fixed-route-sharing-plan';
import {readPickupMatches,planRoute,activeOn} from './route-plan';
import {PickupError} from './pickup-settings';

export async function readRouteSharing(c:Pick<PoolClient,'query'>):Promise<RouteSharing[]> {
 return (await c.query(`select id,source_route_id as "sourceRouteId",partner_route_id as "partnerRouteId",school_id as "schoolId" from fixed_route_sharing where operating_term_id=current_operating_term()`)).rows;
}
export function sharingError(e:unknown):never {
 const [zh,en]=String(e instanceof Error?e.message:e).split(' / ');
 throw new PickupError(zh,en??zh);
}
export async function validateSharedRoutes(c:PoolClient,source:FixedRoute,partner:FixedRoute,schoolId:string) {
 try {
  if(source.routeType!=='RECURRING'||partner.routeType!=='RECURRING')throw new Error('共享仅用于固定线路 / Sharing requires recurring routes');
  if(source.startsOn!==partner.startsOn||source.endsOn!==partner.endsOn||[...source.weekdays].sort().join()!==[...partner.weekdays].sort().join())throw new Error('共享线路的日期范围和星期须一致 / Shared routes need matching dates and weekdays');
  const pair=sharedRouteRosters(source,partner,schoolId);
  if(!source.enabled&&!partner.enabled)return pair;
  if(!source.driverId||!partner.driverId||source.driverId===partner.driverId||!source.vehicleId||!partner.vehicleId||source.vehicleId===partner.vehicleId)throw new Error('请为共享线路绑定不同司机和车辆 / Assign different drivers and vehicles');
  const pickups=[source,partner].map(r=>r.stops.find(s=>s.schoolId===schoolId)!);
  if(pickups[0].time!==pickups[1].time)throw new Error('两车须同时到达共享学校 / Shared school pickup times must match');
  const vehicles=(await c.query('select id,capacity from vehicles where id=any($1::uuid[]) and active and status<>\'MAINTENANCE\'',[ [source.vehicleId,partner.vehicleId] ])).rows;
  if(vehicles.length!==2)throw new Error('共享车辆不可用 / Shared vehicle unavailable');
  sharedCapacity([pair.source,pair.partner],pair.sharedIds,[source,partner].map(r=>vehicles.find(v=>v.id===r.vehicleId).capacity));
  return pair;
 }catch(e){sharingError(e);}
}

// Mirror only the shared-school roster; retain every other school's fixed riders.
export async function syncSharedRoster(c:PoolClient,pair:ReturnType<typeof sharedRouteRosters>) {
 await c.query('delete from fixed_route_students where route_id=$1',[pair.partner.id]);
 for(const a of pair.partner.students)await c.query('insert into fixed_route_students values($1,$2,$3,$4)',[pair.partner.id,a.studentId,a.pickupStopId,a.dropoffStopId]);
 await c.query('update fixed_routes set updated_at=clock_timestamp() where id=$1',[pair.partner.id]);
}

export async function materializeSharedRoutes(c:PoolClient,routes:FixedRoute[],groups:RouteSharing[],date:string) {
 for(const group of groups){
  const source=routes.find(r=>r.id===group.sourceRouteId),partner=routes.find(r=>r.id===group.partnerRouteId);
  if(!source||!partner)continue;
  const pairRoutes=[source,partner],routeIds=pairRoutes.map(r=>r.id);
  const revision=pairRoutes.map(r=>r.updatedAt).join('|');
  const issue=async(message:string)=>{for(const id of routeIds)await c.query('insert into route_task_issues values($1,$2,$3) on conflict(route_id,service_date) do update set message=$3',[id,date,message]);};
  await c.query('delete from route_task_issues where route_id=any($1::uuid[]) and service_date=$2',[routeIds,date]);
  await c.query('savepoint shared_day');
  try {
   let existing=(await c.query(`select t.id,t.shift_id,t.fixed_route_id,t.shared_route_revision,t.route_stops,sh.driver_id,sh.vehicle_id from trips t join driver_shifts sh on sh.id=t.shift_id where t.scheduled_date=$2 and t.fixed_route_id=any($1::uuid[]) order by t.id for update of t`,[routeIds,date])).rows;
   // Adopt an existing manually published pair only when both vehicles and the exact roster match.
   if(!existing.length){
    const legacy=(await c.query(`select t.id,t.shift_id,t.fixed_route_id,t.shared_route_revision,t.route_stops,sh.driver_id,sh.vehicle_id from trips t join driver_shifts sh on sh.id=t.shift_id where t.operating_term_id=current_operating_term() and t.fixed_route_id is null and t.scheduled_date=$1 and t.status<>'CANCELED' and sh.vehicle_id=any($2::uuid[]) and exists(select 1 from shared_pickup_members m where m.trip_id=t.id) order by t.id for update of t`,[date,pairRoutes.map(r=>r.vehicleId)])).rows;
    if(legacy.length){
     if(legacy.length!==2||pairRoutes.some(r=>!legacy.some(t=>t.driver_id===r.driverId&&t.vehicle_id===r.vehicleId)))throw new Error('已有共享车次与固定线路不匹配，请先核对 / Existing shared trips do not match this route pair');
     existing=legacy.map(t=>({...t,fixed_route_id:pairRoutes.find(r=>r.vehicleId===t.vehicle_id)!.id,adopt:true}));
    }
   }
   const tripIds=existing.map(t=>t.id);
   const started=tripIds.length && (await c.query(`select 1 from trips t where t.id=any($1::uuid[]) and (t.status in ('IN_PROGRESS','COMPLETED','NEEDS_ATTENTION') or exists(select 1 from trip_segment_completions f where f.trip_id=t.id) or exists(select 1 from trip_students ts where ts.trip_id=t.id and (ts.picked_up_at is not null or ts.status in ('PICKED_UP','DROPPED_OFF','EXCEPTION') or (ts.status='ABSENT' and not ts.parent_absence))))`,[tripIds])).rowCount;
   if(started){if(existing.some(t=>t.shared_route_revision!==revision))await issue('共享车次已有执行记录，保留当日安排 / Shared trips already started; original assignments retained');await c.query('release savepoint shared_day');continue;}
   const cancel=async()=>{if(tripIds.length){await c.query("update trips set status='CANCELED',updated_at=clock_timestamp() where id=any($1::uuid[])",[tripIds]);await c.query("update driver_shifts set status='CANCELED' where id=any($1::uuid[])",[existing.map(t=>t.shift_id)]);}};
   if(!pairRoutes.every(r=>activeOn(r,date))){await cancel();await c.query('release savepoint shared_day');continue;}
   const pair=await validateSharedRoutes(c,source,partner,group.schoolId);
   const allIds=[...new Set([pair.source,pair.partner].flatMap(r=>r.students.map(a=>a.studentId)))];
   await c.query('select id from students where id=any($1::uuid[]) order by id for update',[allIds]);
   const matches=await readPickupMatches(c,allIds,date);
   const plans=[pair.source,pair.partner].map(r=>planRoute(r,matches));
   const sharedIds=new Set([...pair.sharedIds].filter(id=>plans.every(p=>p.students.some(a=>a.studentId===id))));
   const eligible=[...new Set(plans.flatMap(p=>p.students.map(a=>a.studentId)))];
   if(!eligible.length){await cancel();await c.query('release savepoint shared_day');continue;}
   const absences=new Set<string>((await c.query('select student_id from student_day_plans where service_date=$1 and absent and student_id=any($2::uuid[])',[date,eligible])).rows.map(r=>r.student_id));
   const vehicles=(await c.query('select id,capacity from vehicles where id=any($1::uuid[]) and active and status<>\'MAINTENANCE\'',[pairRoutes.map(r=>r.vehicleId)])).rows;
   if(vehicles.length!==2||(await c.query("select id from drivers where id=any($1::uuid[]) and active and status='AVAILABLE'",[pairRoutes.map(r=>r.driverId)])).rowCount!==2)throw new Error('共享司机或车辆不可用 / Shared driver or vehicle unavailable');
   sharedCapacity(plans,sharedIds,pairRoutes.map(r=>vehicles.find(v=>v.id===r.vehicleId).capacity),absences);
   const old=(await c.query('select id,student_id,trip_id,status from trip_students where trip_id=any($1::uuid[]) order by id for update',[tripIds])).rows;
   if(existing.some(t=>t.adopt)){
    const locationKey=(stops:FixedRoute['stops'])=>stops.map(s=>s.schoolId??s.programId??`${s.name}:${s.address}`).join('|');
    if(existing.some(t=>locationKey(t.route_stops??[])!==locationKey(plans[pairRoutes.findIndex(r=>r.id===t.fixed_route_id)].stops)))throw new Error('已有共享车次站点不同，需先核对 / Existing shared trip stops differ');
    if((await c.query('select 1 from shared_pickup_members where assignment_id=any($1::uuid[]) and not(trip_id=any($2::uuid[]))',[old.map(a=>a.id),tripIds])).rowCount)throw new Error('已有车次还与其他车辆共享 / Existing trips share with another vehicle');
    const actual=new Set(old.map(a=>a.student_id));
    if(actual.size!==eligible.length||eligible.some(id=>!actual.has(id))||old.length!==actual.size)throw new Error('已有共享车次名单不同，需先核对后关联 / Existing shared roster differs; review before linking');
   }
   const conflicts=(await c.query(`select 1 from trip_students ts join trips t on t.id=ts.trip_id where t.operating_term_id=current_operating_term() and t.scheduled_date=$1 and t.status<>'CANCELED' and not(t.id=any($2::uuid[])) and ts.student_id=any($3::uuid[]) limit 1`,[date,tripIds,eligible])).rowCount;
   if(conflicts)throw new Error('共享学生已有其他行程，请先处理冲突 / Shared rider has another trip');
   const newTrips:string[]=[];
   for(let i=0;i<2;i++){
    const r=pairRoutes[i],p=plans[i],prior=existing.find(t=>t.fixed_route_id===r.id);
    // No eligible school today: cancel this leg without creating an empty shift.
    if(!p.students.length){if(prior){await c.query("update trips set status='CANCELED' where id=$1",[prior.id]);await c.query("update driver_shifts set status='CANCELED' where id=$1",[prior.shift_id]);}newTrips.push('');continue;}
    if(p.stops.at(-1)!.time>'23:59')throw new Error('站点时间超过当天 / Stops extend beyond this day');
    if((await c.query(`select 1 from driver_shifts where shift_date=$1 and status<>'CANCELED' and not(id=any($2::uuid[])) and (driver_id=$3 or vehicle_id=$4) and start_time<$6::time and end_time>$5::time`,[date,existing.map(t=>t.shift_id),r.driverId,r.vehicleId,p.stops[0].time,p.stops.at(-1)!.time])).rowCount)throw new Error('共享司机或车辆与其他车次冲突 / Shared driver or vehicle has another overlapping trip');
    const shift=prior?.shift_id||(await c.query('insert into driver_shifts(driver_id,vehicle_id,shift_date,start_time,end_time) values($1,$2,$3,$4,$5) returning id',[r.driverId,r.vehicleId,date,p.stops[0].time,p.stops.at(-1)!.time])).rows[0].id;
    await c.query("update driver_shifts set driver_id=$2,vehicle_id=$3,start_time=$4,end_time=$5,status='SCHEDULED' where id=$1",[shift,r.driverId,r.vehicleId,p.stops[0].time,p.stops.at(-1)!.time]);
    const trip=prior?.id||(await c.query('insert into trips(shift_id,scheduled_date,departure_time,fixed_route_id,route_name,route_stops) values($1,$2,$3,$4,$5,$6) returning id',[shift,date,p.stops[0].time,r.id,r.name,JSON.stringify(p.stops)])).rows[0].id;
    await c.query("update trips set fixed_route_id=$2,route_name=$3,route_stops=$4,departure_time=$5,status='PUBLISHED',shared_route_revision=$6,updated_at=clock_timestamp() where id=$1",[trip,r.id,r.name,JSON.stringify(p.stops),p.stops[0].time,revision]);newTrips.push(trip);
   }
   await c.query('delete from shared_pickup_members where trip_id=any($1::uuid[])',[tripIds]);
   // Keep the canonical assignment id, parent absence and audit history across all edits.
   for(const studentId of eligible){
    const prior=old.find(a=>a.student_id===studentId);
    const index=sharedIds.has(studentId)?Math.max(0,newTrips.indexOf(prior?.trip_id)):plans.findIndex(p=>p.students.some(a=>a.studentId===studentId));
    const a=plans[index].students.find(a=>a.studentId===studentId)!;
    const trip=newTrips[index];
    let assignment=prior?.id;
    if(assignment)await c.query('update trip_students set trip_id=$2,pickup_stop_id=$3,dropoff_stop_id=$4,updated_at=clock_timestamp() where id=$1',[assignment,trip,a.pickupStopId,a.dropoffStopId]);
    else assignment=(await c.query("insert into trip_students(trip_id,student_id,pickup_stop_id,dropoff_stop_id,status,parent_absence) values($1,$2,$3,$4,$5,$6) returning id",[trip,studentId,a.pickupStopId,a.dropoffStopId,absences.has(studentId)?'ABSENT':'SCHEDULED',absences.has(studentId)])).rows[0].id;
    if(sharedIds.has(studentId))for(let j=0;j<2;j++){const mapped=plans[j].students.find(a=>a.studentId===studentId)!;await c.query('insert into shared_pickup_members values($1,$2,$3,$4)',[assignment,newTrips[j],mapped.pickupStopId,mapped.dropoffStopId]);}
   }
   // Obsolete unstarted assignments are canceled with the old trip only if they have history.
   const removed=old.filter(a=>!eligible.includes(a.student_id));
   for(const a of removed){
    if((await c.query('select 1 from status_history where trip_student_id=$1',[a.id])).rowCount)throw new Error('被移出学生已有状态历史，需人工核对 / Removed rider has history; review required');
    await c.query('delete from trip_students where id=$1',[a.id]);
   }
   await c.query('release savepoint shared_day');
  }catch(e){
   await c.query('rollback to savepoint shared_day');await c.query('release savepoint shared_day');
   if(!(e instanceof PickupError)&&!(e instanceof Error&&e.message.includes(' / ')))throw e;
   // A failed refresh must not leave stale, unstarted linked trips executable.
   const cancelable=(await c.query(`select t.id,t.shift_id from trips t where t.fixed_route_id=any($1::uuid[]) and t.scheduled_date=$2 and t.status not in ('IN_PROGRESS','COMPLETED','NEEDS_ATTENTION')
    and not exists(select 1 from trip_segment_completions f where f.trip_id=t.id)
    and not exists(select 1 from trip_students ts where ts.trip_id=t.id and (ts.picked_up_at is not null or ts.status in ('PICKED_UP','DROPPED_OFF','EXCEPTION') or (ts.status='ABSENT' and not ts.parent_absence)))`,[routeIds,date])).rows;
   await c.query("update trips set status='CANCELED',updated_at=clock_timestamp() where id=any($1::uuid[])",[cancelable.map(t=>t.id)]);
   await c.query("update driver_shifts set status='CANCELED' where id=any($1::uuid[])",[cancelable.map(t=>t.shift_id)]);
   await issue(e instanceof PickupError?`${e.zh} / ${e.en}`:e instanceof Error?e.message:'共享任务生成失败 / Shared task generation failed');
  }
 }
}
