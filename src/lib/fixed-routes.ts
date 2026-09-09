import {readRouteSharing,validateSharedRoutes,syncSharedRoster,materializeSharedRoutes} from './fixed-route-sharing';
import { requireTerm, openTerm } from "./operating-terms";
import "server-only";
import { readPickupMatches, planRoute, overCapacity as exceedsCapacity } from "./route-plan";
import { routeName } from "./route-name";
import type { PoolClient } from "pg";
import type { FixedRoute, RouteStop, RouteStudent } from "./fixed-route-types";
import { PickupError } from "./pickup-settings";
import { validServiceDate, recomputeTrip } from "./day-plans";

const error=(zh:string,en:string):never=>{throw new PickupError(zh,en);};
export async function lockRoutes(c:PoolClient) { await c.query("select pg_advisory_xact_lock(70919009)"); }
export async function readFixedRoutes(c:Pick<PoolClient,"query">,scope?:{driverId:string;date:string}):Promise<FixedRoute[]> {
 return (await c.query(`select r.id,r.name,r.notes,r.route_type as "routeType",r.starts_on::text as "startsOn",r.ends_on::text as "endsOn",r.weekdays,r.driver_id as "driverId",r.vehicle_id as "vehicleId",r.enabled,r.updated_at::text as "updatedAt",
 (select jsonb_build_object('id',g.id,'sourceRouteId',g.source_route_id,'partnerRouteId',g.partner_route_id,'schoolId',g.school_id) from fixed_route_sharing g where r.id in (g.source_route_id,g.partner_route_id)) as sharing,
 coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'address',s.address,'schoolId',s.school_id,'programId',s.program_id,'time',coalesce(to_char(s.arrival_time,'HH24:MI'),'')) order by s.position) from fixed_route_stops s where s.route_id=r.id),'[]') as stops,
 coalesce((select jsonb_agg(jsonb_build_object('studentId',a.student_id,'pickupStopId',a.pickup_stop_id,'dropoffStopId',a.dropoff_stop_id)) from fixed_route_students a where a.route_id=r.id),'[]') as students
 from fixed_routes r where r.operating_term_id=current_operating_term()
 and ($1::uuid is null or r.driver_id=$1 or exists(select 1 from trips t join driver_shifts sh on sh.id=t.shift_id where t.fixed_route_id=r.id and t.scheduled_date=$2::date and sh.driver_id=$1))
 order by r.name`,[scope?.driverId??null,scope?.date??null])).rows;
}
export async function readRouteTaskIssues(c:Pick<PoolClient,"query">,date:string) {
 return (await c.query<{name:string;message:string}>("select r.name,i.message from route_task_issues i join fixed_routes r on r.id=i.route_id where r.operating_term_id=current_operating_term() and i.service_date=$1 order by r.name",[date])).rows;
}
export async function saveFixedRoute(c:PoolClient,f:FormData,pairedSave=false) {
 await lockRoutes(c);
 const operation=await requireTerm(c);
 const str=(key:string)=>String(f.get(key)??"").trim();
 const id=str("id"), starts=str("startsOn"), ends=str("endsOn"), driver=str("driverId")||null, vehicle=str("vehicleId")||null, enabled=str("enabled")==="on";
 const group=id?(await readRouteSharing(c)).find(g=>[g.sourceRouteId,g.partnerRouteId].includes(id)):undefined;
 const notes=str("notes");
 if(notes.length>4000) error("线路说明过长。","Route notes are too long.");
 const routeType=str('routeType')||'RECURRING';
 if(!['RECURRING','TEMPORARY'].includes(routeType)) error('线路类型无效。','Invalid route type.');
 const weekdays=[...new Set(f.getAll("weekdays").map(Number))];
 const stops:RouteStop[]=JSON.parse(str("stops")||"[]"), students:RouteStudent[]=JSON.parse(str("students")||"[]");
 if(!validServiceDate(starts)||!validServiceDate(ends)||starts>ends||Date.parse(ends)-Date.parse(starts)>550*86400000) error("请填写有效起止日期（不超过 550 天）。","Enter valid dates (up to 550 days).");
 if(starts<operation.startsOn || ends>operation.endsOn) error("线路日期须在当前学期范围内。", "Route dates must be within the operating term.");
 if(id && !(await c.query("select 1 from fixed_routes where id=$1 and operating_term_id=$2",[id,operation.id])).rowCount) error("线路不属于当前学期。", "Route is not in the current term.");
 if(!weekdays.length||weekdays.some(d=>!Number.isInteger(d)||d<1||d>7)) error("请选择接送星期。","Select valid weekdays.");
 if(!Array.isArray(stops)||stops.length<2||stops.length>30||new Set(stops.map(s=>s.id)).size!==stops.length) error("线路至少需要两个不同站点。","Add at least two distinct stops.");
 for(let i=0;i<stops.length;i++) {
  const s=stops[i];
  if(!/^[0-9a-f-]{36}$/i.test(s.id)||(enabled||s.time!=="") && (!/^([01]\d|2[0-3]):[0-5]\d$/.test(s.time)|| (i>0 && stops[i-1].time!=="" && s.time<=stops[i-1].time))) error("请按先后顺序填写站点时间。","Stop times must be in increasing order.");
  if(s.schoolId&&s.programId) error("每站只能选择一个地点。","Choose one location per stop.");
  if(s.schoolId||s.programId) {
   const location=(await c.query(`select ${s.schoolId?"coalesce(short_name,name)":"name"} as name,address from ${s.schoolId?"schools":"after_school_programs"} where id=$1`,[s.schoolId||s.programId])).rows[0];
   if(!location) error("地点不存在。","Location not found.");
   s.name=location.name;s.address=location.address;
  }
  if(!s.name?.trim()||!s.address?.trim()||s.name.length>160||s.address.length>500) error("请填写站点名称和地址。","Enter each stop's name and address.");
 }
 const baseName=str("name") || routeName(stops);
 if(baseName.length>160) error("线路名称过长。","Route name is too long.");
 let name=baseName, suffix=2;
 while((await c.query("select 1 from fixed_routes where operating_term_id=current_operating_term() and lower(name)=lower($1) and id<>coalesce($2::uuid,gen_random_uuid())",[name,id||null])).rowCount) name=`${baseName} (${suffix++})`;
 if(!Array.isArray(students)||students.length>200||new Set(students.map(s=>s.studentId)).size!==students.length) error("学生清单无效。","Invalid student list.");
 let partner:FixedRoute|undefined;
 if(group){
  partner=(await readFixedRoutes(c)).find(r=>r.id===(id===group.sourceRouteId?group.partnerRouteId:group.sourceRouteId))!;
  partner={...partner,startsOn:starts,endsOn:ends,weekdays,enabled};
  if(id===group.partnerRouteId){
   const projected=await validateSharedRoutes(c,partner,{id,name:'',routeType:routeType as FixedRoute['routeType'],startsOn:starts,endsOn:ends,weekdays,driverId:driver,vehicleId:vehicle,enabled,updatedAt:'',stops,students},group.schoolId);
   students.splice(0,students.length,...projected.partner.students);
  }
 }
 const studentRows=(await c.query("select s.id,s.program_id,s.school_id from students s where s.active and s.id=any($1::uuid[])",[students.map(s=>s.studentId)])).rows;
 for(const a of students) {
  const st=studentRows.find(s=>s.id===a.studentId), from=stops.findIndex(s=>s.id===a.pickupStopId), to=stops.findIndex(s=>s.id===a.dropoffStopId);
  if(!st||from<0||to<=from||stops[from].schoolId!==st.school_id) error("请选择学生所属学校的上车站和后续下车站。","Select the student's school pickup and a later dropoff stop.");
 }
 for(const a of students) if(!(await c.query("select 1 from term_students where operating_term_id=$1 and student_id=$2 and (reviewed or not $3)",[operation.id,a.studentId,enabled])).rowCount) error("请先核对本学期学生年级、班级和课外班。", "Review this term's student details before enabling.");
 if(enabled) for(const a of students) {
  if(!(await c.query(`select 1 from students s join school_pickup_rules p on p.operating_term_id=current_operating_term() and p.school_id=s.school_id and trim(s.grade)=any(p.grades) and p.weekdays && $2::integer[] join school_terms t on t.operating_term_id=current_operating_term() and t.school_id=s.school_id and t.starts_on<=$4::date and t.ends_on>=$3::date where s.id=$1`,[a.studentId,weekdays,starts,ends])).rowCount) error("启用前请先设置学生所属学校的学期和年级接送规则。","Configure school terms and grade pickup rules before enabling.");
 }
 if(driver&&!(await c.query("select id from drivers where id=$1 and active and status='AVAILABLE'",[driver])).rowCount) error("司机不可用。","Driver unavailable.");
 const v=vehicle?(await c.query("select capacity from vehicles where id=$1 and active and status<>'MAINTENANCE'",[vehicle])).rows[0]:null;
 if(vehicle&&!v) error("车辆不可用。","Vehicle unavailable.");
 if(enabled&&v&&!group) for(let i=0;i<stops.length;i++) if(students.filter(a=>stops.findIndex(s=>s.id===a.pickupStopId)<=i&&stops.findIndex(s=>s.id===a.dropoffStopId)>i).length>v.capacity) error("某段线路学生数超过车辆座位数。","Vehicle capacity exceeded on a route segment.");
 if(enabled&&(!driver||!vehicle||!students.length)) error("启用前请绑定司机、车辆并选择学生。","Assign driver, vehicle and students before enabling.");
 if(enabled&&(await c.query(`select 1 from fixed_routes r where r.operating_term_id=current_operating_term() and enabled and id<>coalesce($1::uuid,gen_random_uuid()) and starts_on<=$3::date and ends_on>=$2::date and weekdays && $4::integer[] and (
 ((driver_id=$5 or vehicle_id=$6) and (select min(arrival_time) from fixed_route_stops where route_id=r.id)<$9::time and (select max(arrival_time) from fixed_route_stops where route_id=r.id)>$8::time)
 or (r.route_type=$10 and exists(select 1 from fixed_route_students a join students s on s.id=a.student_id where a.route_id=r.id and a.student_id=any($7::uuid[]) and not(coalesce(r.id=$11::uuid and s.school_id=$12::uuid,false)))))`,[id||null,starts,ends,weekdays,driver,vehicle,students.map(a=>a.studentId),stops[0].time,stops.at(-1)!.time,routeType,partner?.id??null,group?.schoolId??null])).rowCount) error("同一日期的司机、车辆或学生已有冲突安排。","Driver, vehicle or student has an overlapping route.");
 if(group&&partner){
  const current:FixedRoute={id,name,routeType:routeType as FixedRoute['routeType'],startsOn:starts,endsOn:ends,weekdays,driverId:driver,vehicleId:vehicle,enabled,updatedAt:'',stops,students};
  await validateSharedRoutes(c,id===group.sourceRouteId?current:partner,id===group.sourceRouteId?partner:current,group.schoolId);
 }
 if(id) {
  if(!(await c.query("select id from fixed_routes where id=$1 and updated_at::text=$2",[id,str("updatedAt")])).rowCount) error("线路已更新，请刷新后再试。","Route changed. Refresh before saving.");
  await c.query("update fixed_routes set name=$2,starts_on=$3,ends_on=$4,weekdays=$5,driver_id=$6,vehicle_id=$7,enabled=$8,route_type=$9,updated_at=clock_timestamp() where id=$1",[id,name,starts,ends,weekdays,driver,vehicle,enabled,routeType]);
 }
 const routeId=id||(await c.query("insert into fixed_routes(name,starts_on,ends_on,weekdays,driver_id,vehicle_id,enabled,route_type) values($1,$2,$3,$4,$5,$6,$7,$8) returning id",[name,starts,ends,weekdays,driver,vehicle,enabled,routeType])).rows[0].id;
 await c.query("update fixed_routes set notes=$2 where id=$1",[routeId,notes]);
 await c.query("delete from fixed_route_students where route_id=$1",[routeId]);
 await c.query("delete from fixed_route_stops where route_id=$1",[routeId]);
 for(const [position,s] of stops.entries()) await c.query("insert into fixed_route_stops(id,route_id,position,school_id,program_id,name,address,arrival_time) values($1,$2,$3,$4,$5,$6,$7,$8)",[s.id,routeId,position,s.schoolId,s.programId,s.name,s.address,s.time||null]);
 for(const a of students) await c.query("insert into fixed_route_students values($1,$2,$3,$4)",[routeId,a.studentId,a.pickupStopId,a.dropoffStopId]);
 if(group&&partner&&!pairedSave){
  const latest=(await readFixedRoutes(c)).find(r=>r.id===id)!;
  const pair=await validateSharedRoutes(c,id===group.sourceRouteId?latest:partner,id===group.sourceRouteId?partner:latest,group.schoolId);
  const other=id===group.sourceRouteId?pair.partner:pair.source;
  await saveFixedRoute(c,routeForm(other),true);
 }
}

// One transaction serializes automatic creation and route edits; rider locks share the parent workflow's order.
export async function materializeRoutes(c:PoolClient,date:string,today:string,driverId?:string,replacementSources?:Map<string,string[]>) {
 if(!validServiceDate(date)||date<today) return;
 await lockRoutes(c);
 if(!await openTerm(c))return;
 let routes=await readFixedRoutes(c,driverId?{driverId,date}:undefined);
 // Only expand driver scope on temporary-trip days, to reconcile both sides together.
 if(driverId&&(await c.query(`select 1 from fixed_routes r where r.operating_term_id=current_operating_term() and r.route_type='TEMPORARY' and
 ((r.enabled and $1::date between r.starts_on and r.ends_on) or exists(select 1 from trips t where t.fixed_route_id=r.id and t.scheduled_date=$1)) limit 1`,[date])).rowCount) {
  const allRoutes=await readFixedRoutes(c);
  const saved=(await c.query<{route_id:string;student_id:string}>(`select t.fixed_route_id as route_id,ts.student_id from trips t join trip_students ts on ts.trip_id=t.id where t.operating_term_id=current_operating_term() and t.scheduled_date=$1 and t.fixed_route_id is not null`,[date])).rows;
  const members=new Map(allRoutes.map(r=>[r.id,new Set([...r.students.map(s=>s.studentId),...saved.filter(s=>s.route_id===r.id).map(s=>s.student_id)])]));
  const selected=new Set(routes.map(r=>r.id));
  const students=new Set<string>();
  let expanded=true;
  while(expanded){
   expanded=false;
   for(const id of selected)for(const student of members.get(id)??[])students.add(student);
   for(const r of allRoutes)if(!selected.has(r.id)&&[...members.get(r.id)!].some(id=>students.has(id))){selected.add(r.id);expanded=true;}
  }
  routes=allRoutes.filter(r=>selected.has(r.id));
 }
 const sharing=await readRouteSharing(c);
 const selectedGroups=sharing.filter(g=>routes.some(r=>[g.sourceRouteId,g.partnerRouteId].includes(r.id)));
 if(selectedGroups.length){
  const all=await readFixedRoutes(c);
  for(const group of selectedGroups)for(const id of [group.sourceRouteId,group.partnerRouteId])if(!routes.some(r=>r.id===id))routes.push(all.find(r=>r.id===id)!);
  await materializeSharedRoutes(c,routes,selectedGroups,date);
  const grouped=new Set(selectedGroups.flatMap(g=>[g.sourceRouteId,g.partnerRouteId]));
  routes=routes.filter(r=>!grouped.has(r.id));
 }
 routes.sort((a,b)=>Number(b.routeType==='TEMPORARY')-Number(a.routeType==='TEMPORARY')||a.id.localeCompare(b.id));
 const weekday=new Date(`${date}T12:00:00Z`).getUTCDay()||7;
 const allIds=[...new Set(routes.flatMap(r=>r.students.map(s=>s.studentId)))].sort();
 // Include old rosters after route edits and serialize against driver status changes.
 await c.query("select s.id from students s where s.id=any($3::uuid[]) or s.id in (select ts.student_id from trip_students ts join trips t on t.id=ts.trip_id where t.fixed_route_id=any($1::uuid[]) and t.scheduled_date=$2) order by s.id for update",[routes.map(r=>r.id),date,allIds]);
 for(const r of routes) {
  await c.query("delete from route_task_issues where route_id=$1 and service_date=$2",[r.id,date]);
  const issue=async(message:string)=>{await c.query("insert into route_task_issues values($1,$2,$3) on conflict(route_id,service_date) do update set message=$3",[r.id,date,message]);};
  const existing=(await c.query("select id,shift_id,status from trips where fixed_route_id=$1 and scheduled_date=$2 for update",[r.id,date])).rows[0];
  if(existing && (await c.query("select 1 from shared_pickup_members where trip_id=$1",[existing.id])).rowCount) continue;
  if(existing && (await c.query("select 1 from trip_segment_completions where trip_id=$1",[existing.id])).rowCount) continue;
  // Preserve the actual journey once a driver has acted, including driver-marked absence.
  if(existing&&(await c.query("select 1 from trip_students where trip_id=$1 and (picked_up_at is not null or status in ('PICKED_UP','DROPPED_OFF','EXCEPTION') or (status='ABSENT' and not parent_absence))",[existing.id])).rowCount) continue;
  const eligible:RouteStudent[]=[];
  let matches = r.enabled && r.driverId && r.vehicleId && r.startsOn<=date && r.endsOn>=date && r.weekdays.includes(weekday)
   ? await readPickupMatches(c,r.students.map(a=>a.studentId),date) : [];
  if(r.routeType==='RECURRING') {
   const transferred = new Set((await c.query<{student_id:string}>(`select ts.student_id from trip_students ts join trips t on t.id=ts.trip_id join fixed_routes fr on fr.id=t.fixed_route_id where t.scheduled_date=$1 and t.status<>'CANCELED' and fr.route_type='TEMPORARY' and ts.student_id=any($2::uuid[])`,[date,r.students.map(a=>a.studentId)])).rows.map(s=>s.student_id));
   matches=matches.filter(m=>!transferred.has(m.student_id));
  }
  const planned=planRoute(r,matches);
  eligible.push(...planned.students);
  let stops=planned.stops;
  if(!eligible.length) {if(existing) {await c.query("update trips set status='CANCELED' where id=$1",[existing.id]);await c.query("update driver_shifts set status='CANCELED' where id=$1",[existing.shift_id]);}continue;}
  stops=stops.filter(s=>!s.schoolId || eligible.some(a=>a.pickupStopId===s.id||a.dropoffStopId===s.id));
  if(stops.at(-1)!.time>"23:59") {await issue("站点时间超过当天，请调整线路 / Stop time exceeds this day");if(existing){await c.query("update trips set status='CANCELED' where id=$1",[existing.id]);await c.query("update driver_shifts set status='CANCELED' where id=$1",[existing.shift_id]);}continue;}

  const driver=(await c.query("select id from drivers where id=$1 and active and status='AVAILABLE'",[r.driverId])).rowCount;
  const vehicle=(await c.query("select id,capacity from vehicles where id=$1 and active and status<>'MAINTENANCE'",[r.vehicleId])).rows[0];
  if(!driver||!vehicle) {await issue("固定司机或车辆不可用，请修改线路绑定 / Driver or vehicle unavailable");if(existing){await c.query("update trips set status='CANCELED' where id=$1",[existing.id]);await c.query("update driver_shifts set status='CANCELED' where id=$1",[existing.shift_id]);}continue;}
  const overCapacity=exceedsCapacity(stops,eligible,vehicle.capacity);
  const conflict=(await c.query(`select 1 from driver_shifts sh where shift_date=$1 and status<>'CANCELED' and id<>coalesce($2::uuid,gen_random_uuid()) and (driver_id=$3 or vehicle_id=$4) and start_time<$6::time and end_time>$5::time`,[date,existing?.shift_id??null,r.driverId,r.vehicleId,stops[0].time,stops.at(-1)!.time])).rowCount;
  if(overCapacity||conflict) {await issue(overCapacity?"车辆座位不足，请调整线路 / Vehicle capacity exceeded":"司机或车辆与其他行程时间冲突 / Driver or vehicle has a conflicting trip");if(existing){await c.query("update trips set status='CANCELED' where id=$1",[existing.id]);await c.query("update driver_shifts set status='CANCELED' where id=$1",[existing.shift_id]);}continue;}
  const shiftId=existing?.shift_id||(await c.query("insert into driver_shifts(driver_id,vehicle_id,shift_date,start_time,end_time) values($1,$2,$3,$4,$5) returning id",[r.driverId,r.vehicleId,date,stops[0].time,stops.at(-1)!.time])).rows[0].id;
  if(existing) await c.query("update driver_shifts set status='SCHEDULED',driver_id=$2,vehicle_id=$3,start_time=$4,end_time=$5 where id=$1",[shiftId,r.driverId,r.vehicleId,stops[0].time,stops.at(-1)!.time]);
  const tripId=existing?.id||(await c.query("insert into trips(shift_id,scheduled_date,departure_time,fixed_route_id,route_name,route_stops) values($1,$2,$3,$4,$5,$6) returning id",[shiftId,date,stops[0].time,r.id,r.name,JSON.stringify(stops)])).rows[0].id;
  await c.query("update trips set route_name=$2,route_stops=$3,departure_time=$4,status='PUBLISHED' where id=$1",[tripId,r.name,JSON.stringify(stops),stops[0].time]);
  await c.query("delete from trip_students where trip_id=$1 and not student_id=any($2::uuid[])",[tripId,eligible.map(a=>a.studentId)]);
  if(r.routeType==='TEMPORARY') {
   // Move the assignment itself to retain parent absence and status history. Never alter a started source trip.
   const movable=(await c.query<{id:string;student_id:string;trip_id:string}>(`select ts.id,ts.student_id,ts.trip_id from trip_students ts join trips t on t.id=ts.trip_id join fixed_routes fr on fr.id=t.fixed_route_id
    where ts.student_id=any($1::uuid[]) and t.scheduled_date=$2 and t.id<>$3 and ((t.status<>'CANCELED' and fr.route_type='RECURRING') or (fr.route_type='TEMPORARY' and not fr.enabled and fr.id=any($4::uuid[])))
    and not exists(select 1 from shared_pickup_members m where m.trip_id=t.id)
    and not exists(select 1 from trip_segment_completions f where f.trip_id=t.id)
    and not exists(select 1 from trip_students x where x.trip_id=t.id and (x.picked_up_at is not null or x.status in ('PICKED_UP','DROPPED_OFF','EXCEPTION') or (x.status='ABSENT' and not x.parent_absence)))
    and not exists(select 1 from trip_students other join trips ot on ot.id=other.trip_id where other.student_id=ts.student_id and ot.scheduled_date=$2 and ot.status<>'CANCELED' and ot.id not in (t.id,$3))
    for update of t,ts`,[eligible.map(a=>a.studentId),date,tripId,replacementSources?.get(r.id)??[]])).rows;
   for(const student of movable){
    const assignment=eligible.find(a=>a.studentId===student.student_id)!;
    const prior=(await c.query<{id:string}>('select id from trip_students where trip_id=$1 and student_id=$2',[tripId,student.student_id])).rows[0];
    if(prior){
     await c.query('update status_history set trip_student_id=$1 where trip_student_id=$2',[student.id,prior.id]);
     await c.query('delete from trip_students where id=$1',[prior.id]);
    }
    await c.query('update trip_students set trip_id=$2,pickup_stop_id=$3,dropoff_stop_id=$4,updated_at=clock_timestamp() where id=$1',[student.id,tripId,assignment.pickupStopId,assignment.dropoffStopId]);
   }
   for(const source of new Set(movable.map(s=>s.trip_id))) {
    if((await c.query('select 1 from trip_students where trip_id=$1',[source])).rowCount)await recomputeTrip(c,source);
    else {await c.query("update trips set status='CANCELED',updated_at=clock_timestamp() where id=$1",[source]);await c.query("update driver_shifts set status='CANCELED' where id=(select shift_id from trips where id=$1)",[source]);}
   }
  }
  // Check the whole roster together, still under the same student/route locks.
  const conflicts=new Set((await c.query<{student_id:string}>("select distinct ts.student_id from trip_students ts join trips t on t.id=ts.trip_id where ts.student_id=any($1::uuid[]) and t.scheduled_date=$2 and t.id<>$3 and t.status<>'CANCELED'",[eligible.map(a=>a.studentId),date,tripId])).rows.map(a=>a.student_id));
  if(conflicts.size)await issue("学生已在其他行程中，本线路未重复安排 / A rider already has another trip");
  if(conflicts.size)await c.query('delete from trip_students where trip_id=$1 and student_id=any($2::uuid[])',[tripId,[...conflicts]]);
  const assignments=eligible.filter(a=>!conflicts.has(a.studentId));
  await c.query(`insert into trip_students(trip_id,student_id,status,parent_absence,pickup_stop_id,dropoff_stop_id)
    select $1,a."studentId",case when coalesce(dp.absent,false) then 'ABSENT' else 'SCHEDULED' end,coalesce(dp.absent,false),a."pickupStopId",a."dropoffStopId"
    from jsonb_to_recordset($2::jsonb) as a("studentId" uuid,"pickupStopId" uuid,"dropoffStopId" uuid)
    left join student_day_plans dp on dp.student_id=a."studentId" and dp.service_date=$3::date
    on conflict(trip_id,student_id) do update set pickup_stop_id=excluded.pickup_stop_id,dropoff_stop_id=excluded.dropoff_stop_id`,[tripId,JSON.stringify(assignments),date]);
  if((await c.query("select 1 from trip_students where trip_id=$1",[tripId])).rowCount) await recomputeTrip(c,tripId);
  else {await c.query("update trips set status='CANCELED' where id=$1",[tripId]);await c.query("update driver_shifts set status='CANCELED' where id=$1",[shiftId]);}
 }
}

export function routeForm(route:FixedRoute) {
 const f=new FormData();
 for(const [key,value] of Object.entries({id:route.id,name:route.name,notes:route.notes??'',routeType:route.routeType,startsOn:route.startsOn,endsOn:route.endsOn,driverId:route.driverId??'',vehicleId:route.vehicleId??'',enabled:route.enabled?'on':'',updatedAt:route.updatedAt,stops:JSON.stringify(route.stops),students:JSON.stringify(route.students)}))f.set(key,value);
 for(const day of route.weekdays)f.append('weekdays',String(day));
 return f;
}

export async function configureRouteSharing(c:PoolClient,f:FormData) {
 await lockRoutes(c);const term=await requireTerm(c);
 const sourceId=String(f.get('sourceRouteId')??''),partnerId=String(f.get('partnerRouteId')??''),schoolId=String(f.get('schoolId')??'');
 if(sourceId===partnerId)error('请选择两条不同的线路。','Select two different routes.');
 const routes=await readFixedRoutes(c),source=routes.find(r=>r.id===sourceId),partner=routes.find(r=>r.id===partnerId);
 if(!source||!partner)error('线路不存在或不属于当前学期。','Routes must belong to the current term.');
 if(source!.updatedAt!==String(f.get('sourceVersion'))||partner!.updatedAt!==String(f.get('partnerVersion')))error('线路已更新，请刷新后再试。','Routes changed. Refresh before saving.');
 if((await readRouteSharing(c)).some(g=>[g.sourceRouteId,g.partnerRouteId].some(id=>[sourceId,partnerId].includes(id))))error('线路已有共享关系。请在原线路中维护。','Route already belongs to a sharing pair.');
 const pair=await validateSharedRoutes(c,{...source!,enabled:true},{...partner!,enabled:true},schoolId);
 await c.query('insert into fixed_route_sharing(operating_term_id,source_route_id,partner_route_id,school_id) values($1,$2,$3,$4)',[term.id,sourceId,partnerId,schoolId]);
 // One transaction enables both routes, validates fixed reservations, and checks external conflicts.
 await syncSharedRoster(c,pair);
 const latest=await readFixedRoutes(c);
 await saveFixedRoute(c,routeForm({...latest.find(r=>r.id===sourceId)!,enabled:true}));
}
