import type {FixedRoute,RouteStudent,RouteStop} from './fixed-route-types';
import {overCapacity} from './route-plan';

export type RouteSharing = {id:string;sourceRouteId:string;partnerRouteId:string;schoolId:string};
const fail=(message:string):never=>{throw new Error(message);};
const destination=(stop:RouteStop)=>stop.programId ? `program:${stop.programId}` : stop.schoolId ? `school:${stop.schoolId}` : `${stop.name.trim()}:${stop.address.trim()}`;

export function sharedRouteRosters(source:FixedRoute,partner:FixedRoute,schoolId:string) {
 const pickups=source.stops.filter(s=>s.schoolId===schoolId),targets=partner.stops.filter(s=>s.schoolId===schoolId);
 if(pickups.length!==1||targets.length!==1)fail('两条线路须各有一个共享学校站点 / Each route must visit the shared school once');
 const shared=source.students.filter(a=>a.pickupStopId===pickups[0].id);
 if(!shared.length)fail('主线路未选择共享学校的学生 / Select the shared roster on the source route');
 const dropoffs=shared.map(a=>source.stops.find(s=>s.id===a.dropoffStopId)!);
 if(dropoffs.some(s=>!s)||new Set(dropoffs.map(destination)).size!==1)fail('共享学生须在同一地点下车 / Shared riders must have one common destination');
 const target=partner.stops.find((s,i)=>i>partner.stops.indexOf(targets[0])&&destination(s)===destination(dropoffs[0]));
 if(!target)fail('另一条线路缺少共享学生的下车站 / Partner route must visit the shared destination');
 const fixed=partner.students.filter(a=>a.pickupStopId!==targets[0].id);
 const mapped=shared.map(a=>({...a,pickupStopId:targets[0].id,dropoffStopId:target!.id}));
 return {source,partner:{...partner,students:[...fixed,...mapped]},sharedIds:new Set(shared.map(a=>a.studentId))};
}

export function sharedCapacity(routes:{stops:RouteStop[];students:RouteStudent[]}[],sharedIds:Set<string>,capacities:number[],absentIds=new Set<string>()) {
 const remaining=routes.map((route,index)=>{
  const fixed=route.students.filter(a=>!sharedIds.has(a.studentId)&&!absentIds.has(a.studentId));
  if(overCapacity(route.stops,fixed,capacities[index]))fail('固定学生已超过本车座位 / Fixed riders exceed vehicle capacity');
  const sample=route.students.find(a=>sharedIds.has(a.studentId));
  if(!sample)return 0;
  const from=route.stops.findIndex(s=>s.id===sample.pickupStopId),to=route.stops.findIndex(s=>s.id===sample.dropoffStopId);
  if(from<0||to<=from)fail('共享站点无效 / Invalid shared stops');
  return Math.min(...route.stops.slice(from,to).map((_,offset)=>capacities[index]-fixed.filter(a=>route.stops.findIndex(s=>s.id===a.pickupStopId)<=from+offset&&route.stops.findIndex(s=>s.id===a.dropoffStopId)>from+offset).length));
 });
 const count=[...sharedIds].filter(id=>!absentIds.has(id)).length;
 if(count>remaining.reduce((a,b)=>a+b,0))fail('两车预留固定学生座位后，共享学生仍超出总容量 / Shared riders exceed the combined remaining seats');
 return remaining;
}
