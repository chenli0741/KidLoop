import 'server-only';
import type {PoolClient} from 'pg';
import {readTrialInput} from './schedule-trial-data';
import {trialDay} from './schedule-trial';

// The caller holds the route advisory transaction lock. Preview and publication share trialDay.
export async function materializeTrial(c:PoolClient,date:string){
 await c.query('select id from students where active order by id for update');
 const input=await readTrialInput(c,date,date);
 if(!input.routes.length)return;
 const day=trialDay(input,date);
 const existing=(await c.query(`select t.id,t.shift_id,t.fixed_route_id from trips t where t.operating_term_id=current_operating_term() and t.scheduled_date=$1 and t.fixed_route_id is not null order by t.id for update`,[date])).rows;
 const old=(await c.query(`select ts.id,ts.trip_id,ts.student_id,ts.status,ts.parent_absence,ts.picked_up_at,exists(select 1 from status_history h where h.trip_student_id=ts.id) as history from trip_students ts where ts.trip_id=any($1::uuid[]) order by ts.id for update`,[existing.map(t=>t.id)])).rows;
 const protectedRoutes=new Set(input.existing?.filter(t=>t.started).map(t=>t.routeId).filter((id):id is string=>!!id));
 // Protect the whole actual shared execution group if anyone has already acted.
 const members=(await c.query(`select m.assignment_id,m.trip_id from shared_pickup_members m where m.trip_id=any($1::uuid[])`,[existing.map(t=>t.id)])).rows;
 let changed=true;
 while(changed){changed=false;for(const row of old){
  const related=existing.filter(t=>t.id===row.trip_id||members.some(m=>m.assignment_id===row.id&&m.trip_id===t.id));
  if(related.some(t=>protectedRoutes.has(t.fixed_route_id)))for(const t of related)if(!protectedRoutes.has(t.fixed_route_id)){protectedRoutes.add(t.fixed_route_id);changed=true;}
 }}
 const blocked=new Set(day.issues.filter(i=>i.code!=='OTHER_TRIP').flatMap(i=>i.routeId?[i.routeId]:i.studentId&&i.code!=='UNASSIGNED'?day.plans.filter(p=>p.students.some(a=>a.studentId===i.studentId)).map(p=>p.routeId):[]));
 const immutableStudents=new Set(old.filter(a=>protectedRoutes.has(existing.find(t=>t.id===a.trip_id)!.fixed_route_id)).map(a=>a.student_id));
 for(const p of day.plans)if(!protectedRoutes.has(p.routeId)&&p.students.some(a=>immutableStudents.has(a.studentId))){blocked.add(p.routeId);day.issues.push({code:'STARTED',routeId:p.routeId,message:'学生已有执行安排，保留原记录 / Student trip already started; original retained'});}
 // Never silently drop an assignment with audit history on a roster change.
 for(const a of old)if(a.history&&!immutableStudents.has(a.student_id)&&!day.plans.some(p=>p.students.some(s=>s.studentId===a.student_id))){
  const route=existing.find(t=>t.id===a.trip_id)!.fixed_route_id;protectedRoutes.add(route);
  day.issues.push({code:'HISTORY',routeId:route,message:'移出学生已有操作历史，保留并待核对 / Removed student has history; review needed'});
 }
 await c.query(`delete from route_task_issues where service_date=$1 and route_id=any($2::uuid[])`,[date,input.routes.map(r=>r.id)]);
 for(const r of input.routes){const issues=day.issues.filter(i=>i.routeId===r.id);if(issues.length)await c.query('insert into route_task_issues values($1,$2,$3)',[r.id,date,[...new Set(issues.map(i=>i.message))].join('\n')]);}
 const executable=day.plans.filter(p=>!blocked.has(p.routeId)&&!protectedRoutes.has(p.routeId));
 const tripMap=new Map<string,string>();
 for(const p of executable){
  const prior=existing.find(t=>t.fixed_route_id===p.routeId);
  const shift=prior?.shift_id||(await c.query('insert into driver_shifts(driver_id,vehicle_id,shift_date,start_time,end_time) values($1,$2,$3,$4,$5) returning id',[p.driverId,p.vehicleId,date,p.stops[0].time,p.stops.at(-1)!.time])).rows[0].id;
  await c.query("update driver_shifts set driver_id=$2,vehicle_id=$3,start_time=$4,end_time=$5,status='SCHEDULED' where id=$1",[shift,p.driverId,p.vehicleId,p.stops[0].time,p.stops.at(-1)!.time]);
  const trip=prior?.id||(await c.query('insert into trips(shift_id,scheduled_date,departure_time,fixed_route_id,route_name,route_stops) values($1,$2,$3,$4,$5,$6) returning id',[shift,date,p.stops[0].time,p.routeId,p.name,JSON.stringify(p.stops)])).rows[0].id;
  await c.query("update trips set route_name=$2,route_stops=$3,departure_time=$4,status='PUBLISHED' where id=$1",[trip,p.name,JSON.stringify(p.stops),p.stops[0].time]);tripMap.set(p.routeId,trip);
 }
 const mutableTrips=existing.filter(t=>!protectedRoutes.has(t.fixed_route_id));
 await c.query('delete from shared_pickup_members where trip_id=any($1::uuid[])',[mutableTrips.map(t=>t.id)]);
 const eligible=[...new Set(executable.flatMap(p=>p.students.map(a=>a.studentId)))];
 for(const studentId of eligible){
  const targets=executable.filter(p=>p.students.some(a=>a.studentId===studentId));
  const previous=old.filter(a=>a.student_id===studentId&&!protectedRoutes.has(existing.find(t=>t.id===a.trip_id)!.fixed_route_id));
  const prior=previous.find(a=>a.history)??previous[0];
  const plan=targets.find(p=>tripMap.get(p.routeId)===prior?.trip_id)??targets[0];
  const a=plan.students.find(a=>a.studentId===studentId)!;
  const trip=tripMap.get(plan.routeId)!;
  const absent=input.absences.some(a=>a.date===date&&a.studentId===studentId);
  let assignment=prior?.id;
  for(const duplicate of previous.filter(a=>a.id!==assignment)){
   await c.query('update status_history set trip_student_id=$1 where trip_student_id=$2',[assignment,duplicate.id]);
   await c.query('delete from trip_students where id=$1',[duplicate.id]);
  }
  if(assignment)await c.query('update trip_students set trip_id=$2,pickup_stop_id=$3,dropoff_stop_id=$4,status=$5,parent_absence=$6 where id=$1',[assignment,trip,a.pickupStopId,a.dropoffStopId,absent?'ABSENT':prior.parent_absence?'SCHEDULED':prior.status,absent]);
  else assignment=(await c.query("insert into trip_students(trip_id,student_id,pickup_stop_id,dropoff_stop_id,status,parent_absence) values($1,$2,$3,$4,$5,$6) returning id",[trip,studentId,a.pickupStopId,a.dropoffStopId,absent?'ABSENT':'SCHEDULED',absent])).rows[0].id;
  if(plan.shared[studentId])for(const target of targets){const rider=target.students.find(a=>a.studentId===studentId)!;await c.query('insert into shared_pickup_members values($1,$2,$3,$4)',[assignment,tripMap.get(target.routeId),rider.pickupStopId,rider.dropoffStopId]);}
 }
 for(const t of mutableTrips){
  if(!tripMap.has(t.fixed_route_id)){
   await c.query("update trips set status='CANCELED' where id=$1",[t.id]);await c.query("update driver_shifts set status='CANCELED' where id=$1",[t.shift_id]);
  }else{
   // Keep absence/audit records even when they are not required to consume seats.
   await c.query(`delete from trip_students ts where ts.trip_id=$1 and not(ts.student_id=any($2::uuid[])) and ts.status='SCHEDULED' and not exists(select 1 from status_history h where h.trip_student_id=ts.id)`,[t.id,eligible]);
  }
 }
}
