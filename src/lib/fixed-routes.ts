import "server-only";
import { routeName } from "./route-name";
import type { PoolClient } from "pg";
import type { FixedRoute, RouteStop, RouteStudent } from "./fixed-route-types";
import { PickupError } from "./pickup-settings";
import { validServiceDate, recomputeTrip } from "./day-plans";

const error=(zh:string,en:string):never=>{throw new PickupError(zh,en);};
export async function lockRoutes(c:PoolClient) { await c.query("select pg_advisory_xact_lock(70919009)"); }
export async function readFixedRoutes(c:Pick<PoolClient,"query">):Promise<FixedRoute[]> {
 return (await c.query(`select r.id,r.name,r.starts_on::text as "startsOn",r.ends_on::text as "endsOn",r.weekdays,r.driver_id as "driverId",r.vehicle_id as "vehicleId",r.enabled,r.updated_at::text as "updatedAt",
 coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'address',s.address,'schoolId',s.school_id,'programId',s.program_id,'time',to_char(s.arrival_time,'HH24:MI')) order by s.position) from fixed_route_stops s where s.route_id=r.id),'[]') as stops,
 coalesce((select jsonb_agg(jsonb_build_object('studentId',a.student_id,'pickupStopId',a.pickup_stop_id,'dropoffStopId',a.dropoff_stop_id)) from fixed_route_students a where a.route_id=r.id),'[]') as students
 from fixed_routes r order by r.name`)).rows;
}
export async function saveFixedRoute(c:PoolClient,f:FormData) {
 await lockRoutes(c);
 const str=(key:string)=>String(f.get(key)??"").trim();
 const id=str("id"), starts=str("startsOn"), ends=str("endsOn"), driver=str("driverId")||null, vehicle=str("vehicleId")||null, enabled=str("enabled")==="on";
 const weekdays=[...new Set(f.getAll("weekdays").map(Number))];
 const stops:RouteStop[]=JSON.parse(str("stops")||"[]"), students:RouteStudent[]=JSON.parse(str("students")||"[]");
 if(!validServiceDate(starts)||!validServiceDate(ends)||starts>ends||Date.parse(ends)-Date.parse(starts)>550*86400000) error("请填写有效起止日期（不超过 550 天）。","Enter valid dates (up to 550 days).");
 if(!weekdays.length||weekdays.some(d=>!Number.isInteger(d)||d<1||d>7)) error("请选择接送星期。","Select valid weekdays.");
 if(!Array.isArray(stops)||stops.length<2||stops.length>30||new Set(stops.map(s=>s.id)).size!==stops.length) error("线路至少需要两个不同站点。","Add at least two distinct stops.");
 for(let i=0;i<stops.length;i++) {
  const s=stops[i];
  if(!/^[0-9a-f-]{36}$/i.test(s.id)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(s.time)|| (i>0 && s.time<=stops[i-1].time)) error("请按先后顺序填写站点时间。","Stop times must be in increasing order.");
  if(s.schoolId&&s.programId) error("每站只能选择一个地点。","Choose one location per stop.");
  if(s.schoolId||s.programId) {
   const location=(await c.query(`select name,address from ${s.schoolId?"schools":"after_school_programs"} where id=$1`,[s.schoolId||s.programId])).rows[0];
   if(!location) error("地点不存在。","Location not found.");
   s.name=location.name;s.address=location.address;
  }
  if(!s.name?.trim()||!s.address?.trim()||s.name.length>160||s.address.length>500) error("请填写站点名称和地址。","Enter each stop's name and address.");
 }
 const baseName=routeName(stops);
 let name=baseName, suffix=2;
 while((await c.query("select 1 from fixed_routes where lower(name)=lower($1) and id<>coalesce($2::uuid,gen_random_uuid())",[name,id||null])).rowCount) name=`${baseName} (${suffix++})`;
 if(!Array.isArray(students)||students.length>200||new Set(students.map(s=>s.studentId)).size!==students.length) error("学生清单无效。","Invalid student list.");
 const studentRows=(await c.query("select s.id,s.program_id,c.school_id from students s join classrooms c on c.id=s.classroom_id where s.active and s.id=any($1::uuid[])",[students.map(s=>s.studentId)])).rows;
 for(const a of students) {
  const st=studentRows.find(s=>s.id===a.studentId), from=stops.findIndex(s=>s.id===a.pickupStopId), to=stops.findIndex(s=>s.id===a.dropoffStopId);
  if(!st||from<0||to<=from||stops[from].schoolId!==st.school_id) error("请选择学生所属学校的上车站和后续下车站。","Select the student's school pickup and a later dropoff stop.");
 }
 if(enabled) for(const a of students) {
  if(!(await c.query(`select 1 from students s join classrooms cl on cl.id=s.classroom_id join school_pickup_rules p on p.school_id=cl.school_id and trim(s.grade)=any(p.grades) and p.weekdays && $2::integer[] join school_terms t on t.school_id=cl.school_id and t.starts_on<=$4::date and t.ends_on>=$3::date where s.id=$1`,[a.studentId,weekdays,starts,ends])).rowCount) error("启用前请先设置学生所属学校的学期和年级接送规则。","Configure school terms and grade pickup rules before enabling.");
 }
 if(driver&&!(await c.query("select id from drivers where id=$1 and active and status='AVAILABLE'",[driver])).rowCount) error("司机不可用。","Driver unavailable.");
 const v=vehicle?(await c.query("select capacity from vehicles where id=$1 and active and status<>'MAINTENANCE'",[vehicle])).rows[0]:null;
 if(vehicle&&!v) error("车辆不可用。","Vehicle unavailable.");
 if(v) for(let i=0;i<stops.length;i++) if(students.filter(a=>stops.findIndex(s=>s.id===a.pickupStopId)<=i&&stops.findIndex(s=>s.id===a.dropoffStopId)>i).length>v.capacity) error("某段线路学生数超过车辆座位数。","Vehicle capacity exceeded on a route segment.");
 if(enabled&&(!driver||!vehicle||!students.length)) error("启用前请绑定司机、车辆并选择学生。","Assign driver, vehicle and students before enabling.");
 if(enabled&&(await c.query(`select 1 from fixed_routes r where enabled and id<>coalesce($1::uuid,gen_random_uuid()) and starts_on<=$3::date and ends_on>=$2::date and weekdays && $4::integer[] and (driver_id=$5 or vehicle_id=$6 or exists(select 1 from fixed_route_students where route_id=r.id and student_id=any($7::uuid[]))) and (select min(arrival_time) from fixed_route_stops where route_id=r.id)<$9::time and (select max(arrival_time) from fixed_route_stops where route_id=r.id)>$8::time`,[id||null,starts,ends,weekdays,driver,vehicle,students.map(a=>a.studentId),stops[0].time,stops.at(-1)!.time])).rowCount) error("同一时段的司机、车辆或学生已在线路中安排。","Driver, vehicle or student has an overlapping route.");
 if(id) {
  if(!(await c.query("select id from fixed_routes where id=$1 and updated_at::text=$2",[id,str("updatedAt")])).rowCount) error("线路已更新，请刷新后再试。","Route changed. Refresh before saving.");
  await c.query("update fixed_routes set name=$2,starts_on=$3,ends_on=$4,weekdays=$5,driver_id=$6,vehicle_id=$7,enabled=$8,updated_at=clock_timestamp() where id=$1",[id,name,starts,ends,weekdays,driver,vehicle,enabled]);
 }
 const routeId=id||(await c.query("insert into fixed_routes(name,starts_on,ends_on,weekdays,driver_id,vehicle_id,enabled) values($1,$2,$3,$4,$5,$6,$7) returning id",[name,starts,ends,weekdays,driver,vehicle,enabled])).rows[0].id;
 await c.query("delete from fixed_route_students where route_id=$1",[routeId]);
 await c.query("delete from fixed_route_stops where route_id=$1",[routeId]);
 for(const [position,s] of stops.entries()) await c.query("insert into fixed_route_stops(id,route_id,position,school_id,program_id,name,address,arrival_time) values($1,$2,$3,$4,$5,$6,$7,$8)",[s.id,routeId,position,s.schoolId,s.programId,s.name,s.address,s.time]);
 for(const a of students) await c.query("insert into fixed_route_students values($1,$2,$3,$4)",[routeId,a.studentId,a.pickupStopId,a.dropoffStopId]);
}

// One transaction serializes automatic creation and route edits; rider locks share the parent workflow's order.
export async function materializeRoutes(c:PoolClient,date:string,today:string) {
 if(!validServiceDate(date)||date<today) return;
 await lockRoutes(c);
 const routes=await readFixedRoutes(c);
 const weekday=new Date(`${date}T12:00:00Z`).getUTCDay()||7;
 const allIds=[...new Set(routes.flatMap(r=>r.students.map(s=>s.studentId)))].sort();
 await c.query("select id from students where id=any($1::uuid[]) order by id for update",[allIds]);
 for(const r of routes) {
  await c.query("delete from route_task_issues where route_id=$1 and service_date=$2",[r.id,date]);
  const issue=async(message:string)=>{await c.query("insert into route_task_issues values($1,$2,$3) on conflict(route_id,service_date) do update set message=$3",[r.id,date,message]);};
  const existing=(await c.query("select id,shift_id,status from trips where fixed_route_id=$1 and scheduled_date=$2 for update",[r.id,date])).rows[0];
  // Preserve the actual journey once a driver has acted, including driver-marked absence.
  if(existing&&(await c.query("select 1 from trip_students where trip_id=$1 and (picked_up_at is not null or status in ('PICKED_UP','DROPPED_OFF','EXCEPTION') or (status='ABSENT' and not parent_absence))",[existing.id])).rowCount) continue;
  const eligible:RouteStudent[]=[];
  let stops=r.stops.map(s=>({...s}));
  if(r.enabled&&r.driverId&&r.vehicleId&&r.startsOn<=date&&r.endsOn>=date&&r.weekdays.includes(weekday)) {
   for(const a of r.students) {
    const stop=stops.find(s=>s.id===a.pickupStopId)!;
    const match=(await c.query(`select coalesce(e.pickup_time,p.pickup_time)::text as time from students s join classrooms cl on cl.id=s.classroom_id join school_terms t on t.school_id=cl.school_id and $2::date between t.starts_on and t.ends_on join school_pickup_rules p on p.school_id=cl.school_id and trim(s.grade)=any(p.grades) and $3=any(p.weekdays) left join school_calendar_exceptions e on e.school_id=cl.school_id and $2::date between e.starts_on and e.ends_on where s.id=$1 and s.active and cl.school_id=$4 and (e.id is null or e.pickup_time is not null)`,[a.studentId,date,weekday,stop.schoolId])).rows[0];
    if(match) {eligible.push(a); if(match.time.slice(0,5)!==stop.time) { /* Earliest valid pickup is the school's rule; planned later arrivals remain valid. */
      const special=(await c.query("select to_char(pickup_time,'HH24:MI') as time from school_calendar_exceptions where school_id=$1 and $2::date between starts_on and ends_on and pickup_time is not null",[stop.schoolId,date])).rows[0];
      if(special) stop.time=special.time; else if(stop.time<match.time.slice(0,5)) stop.time=match.time.slice(0,5);
    }}
   }
  }
  // Shift later stops to preserve the planned travel intervals after a school time change.
  for(let i=1;i<stops.length;i++) {const minutes=(s:string)=>Number(s.slice(0,2))*60+Number(s.slice(3,5));const minimum=minutes(stops[i-1].time)+minutes(r.stops[i].time)-minutes(r.stops[i-1].time);if(minutes(stops[i].time)<minimum)stops[i].time=`${String(Math.floor(minimum/60)).padStart(2,'0')}:${String(minimum%60).padStart(2,'0')}`;}
  if(!eligible.length) {if(existing) {await c.query("update trips set status='CANCELED' where id=$1",[existing.id]);await c.query("update driver_shifts set status='CANCELED' where id=$1",[existing.shift_id]);}continue;}
  stops=stops.filter(s=>!s.schoolId || eligible.some(a=>a.pickupStopId===s.id||a.dropoffStopId===s.id));
  if(stops.at(-1)!.time>"23:59") {await issue("站点时间超过当天，请调整线路 / Stop time exceeds this day");if(existing){await c.query("update trips set status='CANCELED' where id=$1",[existing.id]);await c.query("update driver_shifts set status='CANCELED' where id=$1",[existing.shift_id]);}continue;}

  const driver=(await c.query("select id from drivers where id=$1 and active and status='AVAILABLE'",[r.driverId])).rowCount;
  const vehicle=(await c.query("select id,capacity from vehicles where id=$1 and active and status<>'MAINTENANCE'",[r.vehicleId])).rows[0];
  if(!driver||!vehicle) {await issue("固定司机或车辆不可用，请修改线路绑定 / Driver or vehicle unavailable");if(existing){await c.query("update trips set status='CANCELED' where id=$1",[existing.id]);await c.query("update driver_shifts set status='CANCELED' where id=$1",[existing.shift_id]);}continue;}
  const overCapacity=stops.some((_,i)=>eligible.filter(a=>stops.findIndex(s=>s.id===a.pickupStopId)<=i&&stops.findIndex(s=>s.id===a.dropoffStopId)>i).length>vehicle.capacity);
  const conflict=(await c.query(`select 1 from driver_shifts sh where shift_date=$1 and status<>'CANCELED' and id<>coalesce($2::uuid,gen_random_uuid()) and (driver_id=$3 or vehicle_id=$4) and start_time<$6::time and end_time>$5::time`,[date,existing?.shift_id??null,r.driverId,r.vehicleId,stops[0].time,stops.at(-1)!.time])).rowCount;
  if(overCapacity||conflict) {await issue(overCapacity?"车辆座位不足，请调整线路 / Vehicle capacity exceeded":"司机或车辆与其他行程时间冲突 / Driver or vehicle has a conflicting trip");if(existing){await c.query("update trips set status='CANCELED' where id=$1",[existing.id]);await c.query("update driver_shifts set status='CANCELED' where id=$1",[existing.shift_id]);}continue;}
  const shiftId=existing?.shift_id||(await c.query("insert into driver_shifts(driver_id,vehicle_id,shift_date,start_time,end_time) values($1,$2,$3,$4,$5) returning id",[r.driverId,r.vehicleId,date,stops[0].time,stops.at(-1)!.time])).rows[0].id;
  if(existing) await c.query("update driver_shifts set status='SCHEDULED',driver_id=$2,vehicle_id=$3,start_time=$4,end_time=$5 where id=$1",[shiftId,r.driverId,r.vehicleId,stops[0].time,stops.at(-1)!.time]);
  const tripId=existing?.id||(await c.query("insert into trips(shift_id,scheduled_date,departure_time,fixed_route_id,route_name,route_stops) values($1,$2,$3,$4,$5,$6) returning id",[shiftId,date,stops[0].time,r.id,r.name,JSON.stringify(stops)])).rows[0].id;
  await c.query("update trips set route_name=$2,route_stops=$3,departure_time=$4,status='PUBLISHED' where id=$1",[tripId,r.name,JSON.stringify(stops),stops[0].time]);
  await c.query("delete from trip_students where trip_id=$1 and not student_id=any($2::uuid[])",[tripId,eligible.map(a=>a.studentId)]);
  for(const a of eligible) {
   // Respect existing manually created trips, so upgrading cannot put a child on two buses.
   if((await c.query("select 1 from trip_students ts join trips t on t.id=ts.trip_id where ts.student_id=$1 and t.scheduled_date=$2 and t.id<>$3 and t.status<>'CANCELED'",[a.studentId,date,tripId])).rowCount) {await issue("学生已在其他行程中，本线路未重复安排 / A rider already has another trip");continue;}
   await c.query(`insert into trip_students(trip_id,student_id,status,parent_absence,pickup_stop_id,dropoff_stop_id) values($1,$2,case when coalesce((select absent from student_day_plans where student_id=$2 and service_date=$3),false) then 'ABSENT' else 'SCHEDULED' end,coalesce((select absent from student_day_plans where student_id=$2 and service_date=$3),false),$4,$5) on conflict(trip_id,student_id) do update set pickup_stop_id=$4,dropoff_stop_id=$5`,[tripId,a.studentId,date,a.pickupStopId,a.dropoffStopId]);
  }
  if((await c.query("select 1 from trip_students where trip_id=$1",[tripId])).rowCount) await recomputeTrip(c,tripId);
  else {await c.query("update trips set status='CANCELED' where id=$1",[tripId]);await c.query("update driver_shifts set status='CANCELED' where id=$1",[shiftId]);}
 }
}
