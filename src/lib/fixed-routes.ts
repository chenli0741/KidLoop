import 'server-only';
import type {PoolClient} from 'pg';
import type {FixedRoute,RouteStop} from './fixed-route-types';
import {automaticRoster,batchTime,type PickupBatch} from './automatic-roster';
import {readRosterData} from './roster-data';
import {requireTerm} from './operating-terms';
import {PickupError} from './pickup-settings';
import {validServiceDate} from './day-plans';
import {routeName} from './route-name';
import {materializeTrial} from './schedule-materialize';
const error=(zh:string,en:string):never=>{throw new PickupError(zh,en);};
export async function lockRoutes(c:PoolClient){await c.query('select pg_advisory_xact_lock(70919009)');}
export async function readFixedRoutes(c:Pick<PoolClient,"query">,scope?:{driverId:string;date:string},roster?:Promise<Awaited<ReturnType<typeof readRosterData>>>):Promise<FixedRoute[]> {
 const routes:FixedRoute[]=(await c.query(`select r.id,r.name,r.notes,r.excluded_student_ids as "excludedStudentIds",r.route_type as "routeType",r.starts_on::text as "startsOn",r.ends_on::text as "endsOn",r.weekdays,r.driver_id as "driverId",r.vehicle_id as "vehicleId",r.enabled,r.updated_at::text as "updatedAt",
 coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'address',s.address,'schoolId',s.school_id,'programId',s.program_id,'time',coalesce(to_char(s.arrival_time,'HH24:MI'),''),'pickupTime',to_char(s.pickup_time,'HH24:MI'),'dwellMinutes',s.dwell_minutes) order by s.position) from fixed_route_stops s where s.route_id=r.id),'[]') as stops,
 '[]'::jsonb as students
 from fixed_routes r where r.operating_term_id=current_operating_term()
 and ($1::uuid is null or r.driver_id=$1 or exists(select 1 from trips t join driver_shifts sh on sh.id=t.shift_id where t.fixed_route_id=r.id and t.scheduled_date=$2::date and sh.driver_id=$1))
 order by r.name`,[scope?.driverId??null,scope?.date??null])).rows;
 const data=await (roster ?? readRosterData(c));
 return routes.map(r=>({...r,students:automaticRoster(r.stops,data.children,data.rules,r.weekdays,r.excludedStudentIds,r.routeType==='TEMPORARY'?[]:data.batches)}));
}
export async function readRouteTaskIssues(c:Pick<PoolClient,"query">,date:string){
 return (await c.query<{name:string;message:string}>("select r.name,i.message from route_task_issues i join fixed_routes r on r.id=i.route_id where r.operating_term_id=current_operating_term() and i.service_date=$1 order by r.name",[date])).rows;
}
export async function saveFixedRoute(c:PoolClient,f:FormData){
 await lockRoutes(c);const term=await requireTerm(c);
 const str=(key:string)=>String(f.get(key)??'').trim();
 const id=str('id'),starts=str('startsOn'),ends=str('endsOn'),enabled=str('enabled')==='on',driver=str('driverId')||null,vehicle=str('vehicleId')||null;
 const routeType=str('routeType')||'RECURRING',notes=str('notes');
 if(!['RECURRING','TEMPORARY'].includes(routeType))error('线路类型无效。','Invalid route type.');
 if(notes.length>4000)error('线路说明过长。','Route notes too long.');
 if(!validServiceDate(starts)||!validServiceDate(ends)||starts>ends||starts<term.startsOn||ends>term.endsOn)error('请填写学期内的有效日期。','Enter valid dates within the term.');
 const weekdays=[...new Set(f.getAll('weekdays').map(Number))];
 if(!weekdays.length||weekdays.some(d=>!Number.isInteger(d)||d<1||d>7))error('请选择接送星期。','Select weekdays.');
 const stops:RouteStop[]=JSON.parse(str('stops')||'[]');
 const excluded:string[]=JSON.parse(str('excludedStudentIds')||'[]');
 const policies:PickupBatch[]=JSON.parse(str('batches')||'[]');
 if(!Array.isArray(stops)||stops.length<2||stops.length>30||new Set(stops.map(s=>s.id)).size!==stops.length)error('至少选择两个不同站点。','Select at least two distinct stops.');
 if(!Array.isArray(excluded)||excluded.length>1000||excluded.some(id=>typeof id!=='string'||!/^[0-9a-f-]{36}$/i.test(id)))error('学生例外无效。','Invalid exclusions.');
 const data=await readRosterData(c);
 // Trusted internal callers express temporary selections as IDs; locations are still derived.
 if(routeType==='TEMPORARY'&&f.has('selectedStudentIds')){
  const selected:string[]=JSON.parse(str('selectedStudentIds'));
  if(!Array.isArray(selected)||selected.some(id=>!data.children.some(s=>s.id===id)))error('学生选择无效。','Invalid student selection.');
  excluded.splice(0,excluded.length,...data.children.filter(s=>!selected.includes(s.id)).map(s=>s.id));
 }
 for(let i=0;i<stops.length;i++){
  const s=stops[i];
  if(!/^[0-9a-f-]{36}$/i.test(s.id)||((enabled||s.time!=='')&&(!/^([01]\d|2[0-3]):[0-5]\d$/.test(s.time)||(i>0&&stops[i-1].time!==''&&s.time<=stops[i-1].time))))error('请按顺序填写站点时间。','Enter increasing stop times.');
  s.dwellMinutes=Number(s.dwellMinutes??0);if(!Number.isInteger(s.dwellMinutes)||s.dwellMinutes<0||s.dwellMinutes>120)error('预计停留时间无效。','Invalid estimated stop time.');
  if(Boolean(s.schoolId)===Boolean(s.programId))error('请选择学校或课外班。','Choose a school or program.');
  const place=(await c.query(`select ${s.schoolId?'coalesce(short_name,name)':'name'} as name,address from ${s.schoolId?'schools':'after_school_programs'} where id=$1`,[s.schoolId||s.programId])).rows[0];
  if(!place)error('地点不存在。','Place not found.');s.name=place.name;s.address=place.address;
  if(s.schoolId){s.pickupTime=s.pickupTime||batchTime(s,data.rules,weekdays[0]);if(enabled&&(!s.pickupTime||!data.rules.some(r=>r.schoolId===s.schoolId&&r.pickupTime===s.pickupTime&&r.weekdays?.some(d=>weekdays.includes(d)))))error('请先设置该校放学规则并选择接送时段。','Configure dismissal rules and select the pickup batch.');}
  else delete s.pickupTime;
 }
 if(enabled&&(!driver||!vehicle))error('启用前请绑定司机和车辆。','Assign a driver and vehicle before enabling.');
 if(driver&&!(await c.query('select 1 from drivers where id=$1',[driver])).rowCount)error('司机不存在。','Driver not found.');
 if(vehicle&&!(await c.query('select 1 from vehicles where id=$1',[vehicle])).rowCount)error('车辆不存在。','Vehicle not found.');
 const baseName=str('name')||routeName(stops);let name=baseName,suffix=2;
 while((await c.query('select 1 from fixed_routes where operating_term_id=$1 and lower(name)=lower($2) and id<>coalesce($3::uuid,gen_random_uuid())',[term.id,name,id||null])).rowCount)name=`${baseName} (${suffix++})`;
 if(name.length>160)error('线路名称过长。','Route name too long.');
 if(id&&!(await c.query('select 1 from fixed_routes where id=$1 and operating_term_id=$2 and updated_at::text=$3 for update',[id,term.id,str('updatedAt')])).rowCount)error('线路已变化，请刷新后再试。','Route changed. Refresh and retry.');
 const routeId=id||(await c.query('insert into fixed_routes(name,starts_on,ends_on,weekdays,enabled,route_type) values($1,$2,$3,$4,false,$5) returning id',[name,starts,ends,weekdays,routeType])).rows[0].id;
 await c.query('update fixed_routes set name=$2,starts_on=$3,ends_on=$4,weekdays=$5,driver_id=$6,vehicle_id=$7,enabled=$8,route_type=$9,notes=$10,excluded_student_ids=$11,updated_at=clock_timestamp() where id=$1',[routeId,name,starts,ends,weekdays,driver,vehicle,enabled,routeType,notes,[...new Set(excluded)]]);
 await c.query('delete from fixed_route_stops where route_id=$1',[routeId]);
 for(const [position,s] of stops.entries())await c.query('insert into fixed_route_stops(id,route_id,position,school_id,program_id,name,address,arrival_time,pickup_time,dwell_minutes) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[s.id,routeId,position,s.schoolId,s.programId,s.name,s.address,s.time||null,s.pickupTime||null,s.dwellMinutes]);
 if(!Array.isArray(policies))error('共享设置无效。','Invalid sharing settings.');
 if(routeType==='TEMPORARY'&&policies.length)error('临时接送不修改学校共享批次。','Temporary services do not change shared batches.');
 for(const b of policies){
  if(!stops.some(s=>s.schoolId===b.schoolId&&batchTime(s,data.rules,b.weekday)===b.pickupTime)||!weekdays.includes(b.weekday)||typeof b.shared!=='boolean'||!Array.isArray(b.excludedStudentIds)||b.excludedStudentIds.some(id=>!data.children.some(s=>s.id===id&&s.schoolId===b.schoolId)))error('共享批次无效。','Invalid pickup batch.');
  const current=data.batches.find(x=>x.schoolId===b.schoolId&&x.pickupTime===b.pickupTime&&x.weekday===b.weekday);
  if((current?.updatedAt??'')!==(b.updatedAt??''))error('学校接送批次已更新，请刷新。','School pickup batch changed. Refresh.');
  await c.query(`insert into school_pickup_batches(operating_term_id,school_id,pickup_time,weekday,shared,excluded_student_ids) values($1,$2,$3,$4,$5,$6) on conflict(operating_term_id,school_id,pickup_time,weekday) do update set shared=excluded.shared,excluded_student_ids=excluded.excluded_student_ids,updated_at=clock_timestamp()`,[term.id,b.schoolId,b.pickupTime,b.weekday,b.shared,[...new Set(b.excludedStudentIds)]]);
 }
}
export async function materializeRoutes(c:PoolClient,date:string,today:string,_driverId?:string,_replacementSources?:Map<string,string[]>){
 if(!validServiceDate(date)||date<today)return;
 void _driverId;void _replacementSources;
 await lockRoutes(c);await materializeTrial(c,date);
}
export function routeForm(route:FixedRoute){
 const f=new FormData();
 for(const [key,value] of Object.entries({id:route.id,name:route.name,notes:route.notes??'',routeType:route.routeType,startsOn:route.startsOn,endsOn:route.endsOn,driverId:route.driverId??'',vehicleId:route.vehicleId??'',enabled:route.enabled?'on':'',updatedAt:route.updatedAt,stops:JSON.stringify(route.stops),excludedStudentIds:JSON.stringify(route.excludedStudentIds??[])}))f.set(key,value);
 if(route.routeType==='TEMPORARY')f.set('selectedStudentIds',JSON.stringify(route.students.map(a=>a.studentId)));
 for(const day of route.weekdays)f.append('weekdays',String(day));return f;
}
