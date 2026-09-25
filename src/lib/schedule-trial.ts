import {driverAllowsSchools,driverAllowsTime,schoolPreferenceScore,type DriverPreferences} from './driver-preferences';
import { allocateEarlyTrips, type EarlyRequest } from './automatic-extra-trips';
import {familiarityScore,type DriverRun} from './driver-familiarity';
import type { FixedRoute, RouteStop, RouteStudent } from './fixed-route-types';
import { automaticRoster, batchTime, type RosterChild, type DismissalRule, type PickupBatch } from './automatic-roster';
import { planRoute, overlaps } from './route-plan';
import {driverBlockingUnavailability,driverIsAvailable,type DriverUnavailability} from './driver-availability';

export type TrialIssue={code:string;advisory?:boolean;schoolId?:string;studentId?:string;routeId?:string;message:string};
export type TrialPlan={routeId:string;sourceRouteId?:string;assignmentReason?:string;name:string;driverId:string;vehicleId:string;stops:RouteStop[];students:RouteStudent[];shared:Record<string,string>};
export type TrialInput={driverRuns?:DriverRun[];driverUnavailability?:DriverUnavailability[];routes:FixedRoute[];children:RosterChild[];rules:DismissalRule[];batches:PickupBatch[];terms:{schoolId:string;startsOn:string;endsOn:string}[];exceptions:{schoolId:string;startsOn:string;endsOn:string;pickupTime:string|null;gradeTimes:{grades:string[];time:string}[]}[];drivers:(DriverPreferences & {id:string;active:boolean;status:string;earliestDismissalTime?:string|null})[];vehicles:{id:string;active:boolean;status:string;capacity:number}[];absences:{date:string;studentId:string}[];travelTimes?:{fromName:string;toName:string;minutes:number;originDwellMinutes?:number}[];existing?:{date:string;routeId:string|null;tripId:string;sourceRouteId?:string|null;stops?:RouteStop[];started:boolean;driverId:string;vehicleId:string;start:string;end:string;students:string[]}[]};
export type TrialDay={date:string;plans:TrialPlan[];issues:TrialIssue[];expected:number;holiday:boolean;checked:boolean};
export function trialDay(input:TrialInput,date:string):TrialDay {
 const weekday=new Date(date+'T12:00:00Z').getUTCDay()||7;
 const issues:TrialIssue[]=[],expected=new Map<string,{child:RosterChild;normalTime:string;time:string}>();
 let schoolOpen=false;
 for(const child of input.children){
  if(!input.terms.some(t=>t.schoolId===child.schoolId&&t.startsOn<=date&&t.endsOn>=date)||child.noPickupWeekdays?.includes(weekday))continue;
  const exception=input.exceptions.find(e=>e.schoolId===child.schoolId&&e.startsOn<=date&&e.endsOn>=date);
  if(exception&&!exception.pickupTime&&!exception.gradeTimes.length)continue;
  const rules=input.rules.filter(r=>r.schoolId===child.schoolId&&r.grades?.includes(child.grade)&&r.weekdays?.includes(weekday));
  if(!rules.length){if(weekday<=5)issues.push({code:'RULE_MISSING',studentId:child.id,schoolId:child.schoolId,message:'缺少年级放学规则 / Missing dismissal rule'});continue;}
  schoolOpen=true;
  if(!child.reviewed)issues.push({code:'REVIEW',studentId:child.id,schoolId:child.schoolId,message:'学生资料待核对 / Student details need review'});
  const normalTime=rules[0].pickupTime!;
  const time=exception?.gradeTimes.find(g=>g.grades.includes(child.grade))?.time??exception?.pickupTime??normalTime;
  expected.set(child.id,{child,normalTime,time});
 }
 const plans:TrialPlan[]=[],earlyRequests:EarlyRequest[]=[];
 for(const route of input.routes){
  if(!route.enabled||route.startsOn>date||route.endsOn<date||!route.weekdays.includes(weekday))continue;
  let roster=automaticRoster(route.stops,input.children,input.rules,[weekday],route.excludedStudentIds,route.routeType==='TEMPORARY'?[]:input.batches).filter(a=>expected.has(a.studentId));
  const servedByExtra=new Set(input.existing?.filter(t=>t.date===date&&t.started&&t.sourceRouteId===route.id).flatMap(t=>t.students));
  roster=roster.filter(a=>!servedByExtra.has(a.studentId));
  if(!roster.length)continue;
  if(route.routeType!=='TEMPORARY'){
   const candidates=roster.filter(a=>expected.get(a.studentId)!.time<expected.get(a.studentId)!.normalTime);
   const early=candidates.length<roster.length||new Set(candidates.map(a=>expected.get(a.studentId)!.time)).size>1?candidates:[];
   const grouped=new Map<string,RouteStudent[]>();
   for(const a of early){const key=`${a.pickupStopId}:${a.dropoffStopId}:${expected.get(a.studentId)!.time}`;grouped.set(key,[...grouped.get(key)??[],a]);}
   for(const students of grouped.values()){
    const pickup=route.stops.find(s=>s.id===students[0].pickupStopId)!,dropoff=route.stops.find(s=>s.id===students[0].dropoffStopId)!;
    const batch=input.batches.find(b=>b.schoolId===pickup.schoolId&&b.weekday===weekday&&b.pickupTime===batchTime(pickup,input.rules,weekday)&&b.shared);
    earlyRequests.push({sourceRouteId:route.id,preferredDriverId:route.driverId,preferredVehicleId:route.vehicleId,time:expected.get(students[0].studentId)!.time,pickup,dropoff,students,shared:Object.fromEntries(batch?students.map(a=>[a.studentId,batch.id]):[])});
   }
   const ids=new Set(early.map(a=>a.studentId));roster=roster.filter(a=>!ids.has(a.studentId));
   if(!roster.length)continue;
  }
  const serving=roster.filter(a=>!input.absences.some(x=>x.date===date&&x.studentId===a.studentId));
  const r={...route,students:roster};
  const plan=planRoute(r,roster.map(a=>({student_id:a.studentId,school_id:expected.get(a.studentId)!.child.schoolId,time:expected.get(a.studentId)!.time})),input.travelTimes);
  const schools=[...new Set(serving.map(a=>expected.get(a.studentId)!.child.schoolId))];
  const dismissals=[...new Set(serving.map(a=>expected.get(a.studentId)!.time))];
  const interval={start:plan.stops[0].time,end:plan.stops.at(-1)!.time};
  const preferred=input.drivers.find(d=>d.id===route.driverId);
  const eligible=(d:TrialInput['drivers'][number])=>d.active&&d.status==='AVAILABLE'&&driverAllowsSchools(d,schools)&&dismissals.every(time=>driverAllowsTime(d,time))&&driverIsAvailable(input.driverUnavailability,d.id,date,interval.start,interval.end);
  const occupied=(driverId:string)=>{
   if(plans.some(p=>p.driverId===driverId&&overlaps(interval,{start:p.stops[0].time,end:p.stops.at(-1)!.time})))return true;
   if((input.existing??[]).some(t=>t.date===date&&t.driverId===driverId&&(t.started||!t.routeId)&&overlaps(interval,t)))return true;
   // Keep an eligible driver's own fixed route available when it overlaps this cover assignment.
   return input.routes.some(other=>other.id!==route.id&&other.enabled&&other.driverId===driverId&&other.startsOn<=date&&other.endsOn>=date&&other.weekdays.includes(weekday)&&overlaps(interval,{start:other.stops[0].time,end:other.stops.at(-1)!.time}));
  };
  let assigned=preferred&&eligible(preferred)?preferred:undefined;
  let assignmentReason:string|undefined;
  if(!assigned){
   assigned=input.drivers.filter(d=>eligible(d)&&!occupied(d.id)).sort((a,b)=>
    schoolPreferenceScore(b,schools)-schoolPreferenceScore(a,schools)||
    familiarityScore(input.driverRuns??[],b.id,[route.id],schools[0],date)-familiarityScore(input.driverRuns??[],a.id,[route.id],schools[0],date)||
    a.id.localeCompare(b.id)
   )[0];
   if(assigned)assignmentReason=`原线路司机不符合当天条件或处于配置的不可用时段，自动改派；历史熟悉度 ${familiarityScore(input.driverRuns??[],assigned.id,[route.id],schools[0],date).toFixed(2)} / Regular driver does not meet today's conditions or is unavailable; automatic cover assigned`;
  }
  if(!assigned){
   const schoolBlocked=preferred&&!driverAllowsSchools(preferred,schools);
   const timeBlocked=preferred&&serving.find(a=>!driverAllowsTime(preferred,expected.get(a.studentId)!.time));
   const availabilityBlocked=preferred&&driverBlockingUnavailability(input.driverUnavailability,preferred.id,date,interval.start,interval.end);
   if(schoolBlocked)issues.push({code:'DRIVER_SCHOOL',routeId:route.id,message:'线路接送学校不符合司机只接所选学校的设置，且未找到替补司机 / Pickup schools are outside the driver restriction and no cover driver is available'});
   else if(timeBlocked){const dismissal=expected.get(timeBlocked.studentId)!.time;issues.push({code:'DRIVER_TIME',routeId:route.id,message:`当天 ${dismissal} 放学，不在司机可接时间 ${preferred?.earliestDismissalTime??"不限"}–${preferred?.latestDismissalTime??"不限"} 内，且未找到替补司机 / Dismissal ${dismissal} is outside the regular driver's time window and no cover driver is available`});}
   else if(availabilityBlocked)issues.push({code:'DRIVER_UNAVAILABLE',routeId:route.id,message:`司机在 ${availabilityBlocked.startsOn}${availabilityBlocked.endsOn===availabilityBlocked.startsOn?'':` 至 ${availabilityBlocked.endsOn}`} 配置为不可用（${availabilityBlocked.reason}），且未找到替补司机 / Driver is unavailable (${availabilityBlocked.reason}) and no cover driver is available`});
   else issues.push({code:'RESOURCE',routeId:route.id,message:'司机未绑定或不可用，且未找到替补司机 / Driver unavailable and no cover driver is available'});
   continue;
  }
  for(let i=1;i<r.stops.length;i++) if(!input.travelTimes?.some(t=>t.fromName===r.stops[i-1].name&&t.toName===r.stops[i].name)) issues.push({code:'TRAVEL_TIME_DEFAULT',advisory:true,routeId:r.id,message:`缺少 ${r.stops[i-1].name} → ${r.stops[i].name} 的行驶时间，按默认 10 分钟 / Missing travel time; using default 10 minutes`});
  const shared:Record<string,string>={};
  for(const a of roster){
   const stop=r.stops.find(s=>s.id===a.pickupStopId)!;
   const batch=input.batches.find(b=>b.schoolId===stop.schoolId&&b.weekday===weekday&&b.pickupTime===batchTime(stop,input.rules,weekday)&&b.shared);
   if(batch&&route.routeType!=='TEMPORARY')shared[a.studentId]=batch.id;
  }
  if(!input.vehicles.some(v=>v.id===r.vehicleId&&v.active&&v.status!=='MAINTENANCE'))issues.push({code:'RESOURCE',routeId:r.id,message:'车辆未绑定或不可用 / Vehicle unassigned or unavailable'});
  if(plan.stops.at(-1)!.time>'23:59')issues.push({code:'TIME',routeId:r.id,message:'行程超出当天 / Trip extends beyond this day'});
  plans.push({routeId:r.id,name:r.name,driverId:assigned.id,vehicleId:r.vehicleId??'',...plan,shared,assignmentReason});
 }
 // Explicit temporary services take over the student for this date.
 const temporary=new Set(plans.filter(p=>input.routes.find(r=>r.id===p.routeId)?.routeType==='TEMPORARY'&&!issues.some(i=>i.routeId===p.routeId&&i.code==='RESOURCE')).flatMap(p=>p.students.map(a=>a.studentId)));
 for(const p of plans)if(input.routes.find(r=>r.id===p.routeId)?.routeType!=='TEMPORARY')p.students=p.students.filter(a=>!temporary.has(a.studentId));
 for(const p of plans){
  const elsewhere=new Set((input.existing??[]).filter(t=>t.date===date&&!t.routeId).flatMap(t=>t.students));
  if(p.students.some(a=>elsewhere.has(a.studentId))){
   p.students=p.students.filter(a=>!elsewhere.has(a.studentId));
   issues.push({code:'OTHER_TRIP',routeId:p.routeId,message:'部分学生已有其他行程，未重复安排 / Students with another trip are not duplicated'});
  }
 }
 plans.push(...allocateEarlyTrips(input,date,earlyRequests,plans,issues));
 const active=plans.filter(p=>p.students.length&&!(input.routes.find(r=>r.id===p.routeId)?.routeType==='TEMPORARY'&&issues.some(i=>i.routeId===p.routeId&&i.code==='RESOURCE')));
 for(const [studentId,{child}] of expected){
  if(input.absences.some(a=>a.date===date&&a.studentId===studentId))continue;
  const assigned=active.filter(p=>p.students.some(a=>a.studentId===studentId));
  const saved=input.existing?.filter(t=>t.date===date&&t.students.includes(studentId)&&(t.started||!t.routeId))??[];
  if(!assigned.length&&!saved.length)issues.push({code:'UNASSIGNED',studentId,schoolId:child.schoolId,message:'尚未安排接送 / Pickup not arranged'});
  if(assigned.length>1&&(!assigned[0].shared[studentId]||assigned.some(p=>p.shared[studentId]!==assigned[0].shared[studentId])))issues.push({code:'DUPLICATE',studentId,schoolId:child.schoolId,message:'重复安排到非共享线路 / Duplicate non-shared assignment'});
 }
 for(let i=0;i<active.length;i++){
  const a=active[i];
  for(const b of active.slice(i+1))if((a.driverId&&a.driverId===b.driverId||a.vehicleId&&a.vehicleId===b.vehicleId)&&overlaps({start:a.stops[0].time,end:a.stops.at(-1)!.time},{start:b.stops[0].time,end:b.stops.at(-1)!.time})){
   for(const p of [a,b])issues.push({code:'CONFLICT',routeId:p.routeId,message:'司机或车辆时间冲突 / Driver or vehicle time conflict'});
  }
  for(const b of input.existing??[])if(b.date===date&&b.routeId!==a.routeId&&(b.started||!b.routeId)&&(a.driverId===b.driverId||a.vehicleId===b.vehicleId)&&overlaps({start:a.stops[0].time,end:a.stops.at(-1)!.time},b))issues.push({code:'CONFLICT',routeId:a.routeId,message:'与已有执行安排冲突 / Conflicts with an existing trip'});
 }
 let checked=true;
 const pending=new Set(active);
 while(pending.size){
  const component=[pending.values().next().value!];pending.delete(component[0]);
  for(let i=0;i<component.length;i++)for(const p of pending)if(p.students.some(a=>component[i].students.some(b=>a.studentId===b.studentId))){component.push(p);pending.delete(p);}
  const capacity=checkCapacity(component.map(p=>({...p,students:p.students.filter(s=>!input.absences.some(a=>a.date===date&&a.studentId===s.studentId))})),input.vehicles);if(capacity===null)checked=false;
  if(capacity!==true)for(const p of component)issues.push({code:capacity===null?'UNCHECKED':'CAPACITY',routeId:p.routeId,message:capacity===null?'容量试算尚未确定，需要核对 / Capacity check needs review':'接送安排座位不足 / Insufficient seats'});
 }
 return {date,plans:active,issues,expected:[...expected.keys()].filter(id=>!input.absences.some(a=>a.date===date&&a.studentId===id)).length,holiday:!schoolOpen&&!issues.length,checked};
}
// Exact feasibility by segment. Shared riders may board any participating vehicle;
// bounded search never reports success when it has not established a feasible allocation.
export function checkCapacity(plans:TrialPlan[],vehicles:TrialInput['vehicles']):boolean|null {
 const loads=plans.map(p=>p.stops.slice(1).map(()=>0));
 const capacities=plans.map(p=>vehicles.find(v=>v.id===p.vehicleId)?.capacity??0);
 const ids=[...new Set(plans.flatMap(p=>p.students.map(a=>a.studentId)))];
 const choices=ids.map(id=>plans.flatMap((p,index)=>{
  const a=p.students.find(s=>s.studentId===id);if(!a)return [];
  const from=p.stops.findIndex(s=>s.id===a.pickupStopId),to=p.stops.findIndex(s=>s.id===a.dropoffStopId);
  return [{index,from,to}];
 })).sort((a,b)=>a.length-b.length);
 let attempts=0;const failed=new Set<string>();
 function visit(n:number):boolean|null{
  if(n===choices.length)return true;
  if(++attempts>100000)return null;
  const key=n+':'+JSON.stringify(loads);if(failed.has(key))return false;
  for(const {index,from,to} of choices[n]){
   if(from<0||to<=from||loads[index].slice(from,to).some(v=>v>=capacities[index]))continue;
   for(let k=from;k<to;k++)loads[index][k]++;
   const result=visit(n+1);
   for(let k=from;k<to;k++)loads[index][k]--;
   if(result!==false)return result;
  }
  failed.add(key);return false;
 }
 return visit(0);
}
