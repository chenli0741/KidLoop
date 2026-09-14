import {DEFAULT_TRAVEL_MINUTES} from './travel-defaults';
import {driverAllowsSchools,driverAllowsTime,schoolPreferenceScore} from './driver-preferences';
import { createHash } from 'node:crypto';
import { clockTime, minutes } from './route-plan';
import { familiarityScore } from './driver-familiarity';
import type { TrialInput, TrialPlan, TrialIssue } from './schedule-trial';
import type { RouteStop, RouteStudent } from './fixed-route-types';

export type EarlyRequest = { sourceRouteId: string; preferredDriverId: string | null; preferredVehicleId: string | null; time: string; pickup: RouteStop; dropoff: RouteStop; students: RouteStudent[]; shared: Record<string,string> };
function identity(value: string) {
  const h=createHash('sha256').update('kidloop-extra-v1:'+value).digest('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;
}
function place(s: RouteStop) { return s.schoolId ? `school:${s.schoolId}` : `program:${s.programId}`; }

/** Exact recorded direction wins; otherwise use the user-confirmed ten-minute default. */
export function transferMinutes(input: TrialInput, from: RouteStop, to: RouteStop): number {
  if(place(from)===place(to)) return 0;
  return input.travelTimes?.find(t=>t.fromName===from.name&&t.toName===to.name)?.minutes ?? DEFAULT_TRAVEL_MINUTES;
}

function dwell(input: TrialInput, stop: RouteStop) {
  return stop.dwellMinutes || input.travelTimes?.find(t=>t.fromName===stop.name)?.originDwellMinutes || 0;
}

export function allocateEarlyTrips(input: TrialInput, date: string, requests: EarlyRequest[], normal: TrialPlan[], issues: TrialIssue[]): TrialPlan[] {
  const absent=new Set(input.absences.filter(a=>a.date===date).map(a=>a.studentId));
  const protectedStudents=new Set(input.existing?.filter(t=>t.date===date&&t.started).flatMap(t=>t.students));
  const temporary=new Set(normal.filter(p=>input.routes.find(r=>r.id===p.routeId)?.routeType==='TEMPORARY'&&!issues.some(i=>i.routeId===p.routeId&&i.code==='RESOURCE')).flatMap(p=>p.students.map(s=>s.studentId)));
  const groups: EarlyRequest[]=[];
  for(const request of [...requests].sort((a,b)=>a.sourceRouteId.localeCompare(b.sourceRouteId))){
    const students=request.students.filter(s=>!absent.has(s.studentId)&&!temporary.has(s.studentId));
    if(students.some(s=>protectedStudents.has(s.studentId))){
      issues.push({code:'EXTRA_STARTED',routeId:request.sourceRouteId,advisory:true,message:'提前接送涉及已执行学生，保留原行程并待人工核对 / Early pickup includes students already served; original trip retained for review'});
    }
    const remaining=students.filter(s=>!protectedStudents.has(s.studentId));
    // Shared school-batch candidates become one request, not two duplicate pickups.
    const existing=groups.find(g=>place(g.pickup)===place(request.pickup)&&place(g.dropoff)===place(request.dropoff)&&g.time===request.time&&remaining.some(s=>g.students.some(x=>x.studentId===s.studentId)&&g.shared[s.studentId]&&g.shared[s.studentId]===request.shared[s.studentId]));
    if(existing){
      for(const s of remaining)if(!existing.students.some(x=>x.studentId===s.studentId))existing.students.push({...s,pickupStopId:existing.pickup.id,dropoffStopId:existing.dropoff.id});
      continue;
    }
    if(remaining.length)groups.push({...request,students:remaining});
  }
  // Do not duplicate non-shared candidates or take riders from a manual trip.
  const duplicates=new Set<string>();
  for(const group of groups)for(const s of group.students)if(groups.filter(g=>g.students.some(x=>x.studentId===s.studentId)).length>1)duplicates.add(s.studentId);
  const manual=new Set(input.existing?.filter(t=>t.date===date&&!t.routeId).flatMap(t=>t.students));
  for(const group of groups){
    if(group.students.some(s=>duplicates.has(s.studentId)))issues.push({code:'EXTRA_DUPLICATE',routeId:group.sourceRouteId,advisory:true,message:'提前接送学生出现在多个非共享线路，需核对归属 / Early riders appear on multiple non-shared routes; review assignments'});
    group.students=group.students.filter(s=>!duplicates.has(s.studentId)&&!manual.has(s.studentId));
  }
  const tasks=groups.filter(g=>g.students.length).map(g=>{
    const duration=transferMinutes(input,g.pickup,g.dropoff);
    const start=minutes(g.time),end=duration===null?null:start+dwell(input,g.pickup)+duration;
    const routeId=identity(`${g.sourceRouteId}:${place(g.pickup)}:${place(g.dropoff)}:${g.time}`);
    return {g,routeId,end,stops:[{...g.pickup,time:g.time,pickupTime:g.time},{...g.dropoff,time:end===null?'':clockTime(end)}]};
  }).sort((a,b)=>a.g.time.localeCompare(b.g.time)||a.routeId.localeCompare(b.routeId));
  const frozen=input.existing?.filter(t=>t.date===date&&(t.started||!t.routeId))??[];
  const frozenIds=new Set(frozen.map(t=>t.routeId));
  const busy=[...normal.filter(p=>!frozenIds.has(p.routeId)).map(p=>({driverId:p.driverId,vehicleId:p.vehicleId,start:p.stops[0].time,end:p.stops.at(-1)!.time,stops:p.stops})),...frozen];
  function fits(task: typeof tasks[number], driverId: string, vehicleId: string, assigned: TrialPlan[]) {
    if(task.end===null||task.end>1439)return false;
    const start=minutes(task.g.time),end=task.end;
    const other=[...busy,...assigned.map(p=>({driverId:p.driverId,vehicleId:p.vehicleId,start:p.stops[0].time,end:p.stops.at(-1)!.time,stops:p.stops}))];
    for(const b of other){
      if(b.driverId!==driverId&&b.vehicleId!==vehicleId)continue;
      if(start<minutes(b.end)&&minutes(b.start)<end)return false;
      if(!b.stops?.length)return false; // No evidence that repositioning is feasible.
      if(minutes(b.end)<=start){
        const journey=transferMinutes(input,b.stops.at(-1)!,task.stops[0]);
        if(journey===null||minutes(b.end)+dwell(input,b.stops.at(-1)!)+journey>start)return false;
      }else{
        const journey=transferMinutes(input,task.stops[1],b.stops[0]);
        if(journey===null||end+dwell(input,task.stops[1])+journey>minutes(b.start))return false;
      }
    }
    return true;
  }
  const options=tasks.map(task=>input.drivers.filter(d=>d.active&&d.status==='AVAILABLE'&&driverAllowsTime(d,task.g.time)&&driverAllowsSchools(d,[task.g.pickup.schoolId!])).flatMap(d=>{
    const history=familiarityScore(input.driverRuns??[],d.id,[task.g.sourceRouteId],task.g.pickup.schoolId??undefined,date);
    const preference=schoolPreferenceScore(d,[task.g.pickup.schoolId!]);
    const score=history+(d.id===task.g.preferredDriverId?5:0);
    return input.vehicles.filter(v=>v.active&&v.status!=='MAINTENANCE'&&v.capacity>=task.g.students.length).map(v=>({driverId:d.id,vehicleId:v.id,history,preference,score:score+(v.id===task.g.preferredVehicleId?0.1:0)}));
  }).sort((a,b)=>b.preference-a.preference||b.score-a.score||a.driverId.localeCompare(b.driverId)||a.vehicleId.localeCompare(b.vehicleId)));
  let best:TrialPlan[]=[],bestCount=-1,bestScore=-Infinity,bestPreference=-Infinity,visits=0;
  function search(n:number,assigned:TrialPlan[],score:number,preference:number){
    if(++visits>20000)return;
    if(n===tasks.length){const count=assigned.reduce((sum,p)=>sum+p.students.length,0);if(count>bestCount||(count===bestCount&&(preference>bestPreference||(preference===bestPreference&&score>bestScore)))){best=assigned;bestCount=count;bestScore=score;bestPreference=preference;}return;}
    const task=tasks[n];
    for(const option of options[n])if(fits(task,option.driverId,option.vehicleId,assigned))search(n+1,[...assigned,{
      routeId:task.routeId,sourceRouteId:task.g.sourceRouteId,name:`${task.g.pickup.name} → ${task.g.dropoff.name} · Extra ${task.g.time}`,
      driverId:option.driverId,vehicleId:option.vehicleId,stops:task.stops,students:task.g.students,shared:{},
      assignmentReason:`${option.preference?"符合学校偏好 / Preferred school; ":""}历史熟悉度 ${option.history.toFixed(2)}${option.driverId===task.g.preferredDriverId?'，原线路司机':''}；已检查座位和前后行程衔接 / Familiarity ${option.history.toFixed(2)}${option.driverId===task.g.preferredDriverId?', regular route driver':''}; seats and transfers checked`,
    }],score+option.score,preference+option.preference);
    search(n+1,assigned,score,preference);
  }
  search(0,[],0,0);
  for(const task of tasks)if(!best.some(p=>p.routeId===task.routeId))issues.push({
    code:task.end===null?'EXTRA_TRAVEL_MISSING':'EXTRA_UNASSIGNED',routeId:task.g.sourceRouteId,advisory:true,
    message:task.end===null?`${task.g.time} 提前接送缺少学校至目的地行驶时间 / Missing travel time for ${task.g.time} early pickup`:`${task.g.time} 提前接送未找到满足时间、座位和衔接条件的司机车辆，正常行程保留 / No feasible driver and vehicle found for ${task.g.time} early pickup; regular trip retained`,
  });
  if(visits>20000)issues.push({code:'EXTRA_SEARCH_LIMIT',advisory:true,message:'加开接送搜索达到上限，需核对剩余安排 / Extra pickup search reached its limit; review remaining assignments'});
  // Report defaults actually used by the selected plan, not rejected search branches.
  for(const plan of best){
    const defaults=new Set<string>();
    const note=(from:RouteStop,to:RouteStop)=>{
      if(place(from)!==place(to)&&!input.travelTimes?.some(t=>t.fromName===from.name&&t.toName===to.name)) defaults.add(`${from.name} → ${to.name}`);
    };
    note(plan.stops[0],plan.stops[1]);
    const others=[...busy,...best.filter(p=>p!==plan).map(p=>({driverId:p.driverId,vehicleId:p.vehicleId,start:p.stops[0].time,end:p.stops.at(-1)!.time,stops:p.stops}))];
    for(const other of others){
      if((other.driverId!==plan.driverId&&other.vehicleId!==plan.vehicleId)||!other.stops?.length)continue;
      if(other.end<=plan.stops[0].time)note(other.stops.at(-1)!,plan.stops[0]);
      else if(other.start>=plan.stops.at(-1)!.time)note(plan.stops.at(-1)!,other.stops[0]);
    }
    for(const leg of defaults){
      const message=`${leg}：转场/行驶时间未确认，暂按 10 分钟计算，请核对 / Travel time unconfirmed; using 10 minutes, please verify`;
      issues.push({code:'TRAVEL_TIME_DEFAULT',routeId:plan.routeId,advisory:true,message});
      plan.assignmentReason+=`；${message}`;
    }
  }
  return best;
}
