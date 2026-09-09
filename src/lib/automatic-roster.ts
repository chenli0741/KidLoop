import type { RouteStop, RouteStudent } from './fixed-route-types';

export type RosterChild = { id:string; schoolId:string; programId:string; grade:string; name?:string; noPickupWeekdays?:number[]; reviewed?:boolean };
export type DismissalRule = { schoolId:string; grades?:string[]; weekdays?:number[]; pickupTime?:string|null };
export type PickupBatch = { id:string; schoolId:string; pickupTime:string; weekday:number; shared:boolean; excludedStudentIds:string[]; updatedAt:string };
export function batchTime(stop:RouteStop,rules:DismissalRule[],weekday:number) {
 if(stop.pickupTime&&rules.some(r=>r.schoolId===stop.schoolId&&r.weekdays?.includes(weekday)&&r.pickupTime===stop.pickupTime))return stop.pickupTime;
 const times=[...new Set(rules.filter(r=>r.schoolId===stop.schoolId&&r.weekdays?.includes(weekday)&&r.pickupTime).map(r=>r.pickupTime!))];
 const minutes=(t:string)=>Number(t.slice(0,2))*60+Number(t.slice(3,5));
 if(!stop.pickupTime)return times.includes(stop.time)?stop.time:undefined;
 return times.sort((a,b)=>Math.abs(minutes(a)-minutes(stop.pickupTime!))-Math.abs(minutes(b)-minutes(stop.pickupTime!))||a.localeCompare(b))[0];
}
export function automaticRoster(stops:RouteStop[],children:RosterChild[],rules:DismissalRule[],weekdays:number[],excluded:string[]=[],batches:PickupBatch[]=[],includeExcluded=false):RouteStudent[] {
 const result:RouteStudent[]=[];
 for(const child of children){
  for(let i=0;i<stops.length;i++){
   const stop=stops[i];if(stop.schoolId!==child.schoolId)continue;
   const drop=stops.slice(i+1).find(s=>s.programId===child.programId);if(!drop)continue;
   const matches=weekdays.some(day=>{
    const time=batchTime(stop,rules,day);
    if(!rules.some(r=>r.schoolId===child.schoolId&&r.grades?.includes(child.grade.trim())&&r.weekdays?.includes(day)&&r.pickupTime===time))return false;
    const batch=batches.find(b=>b.schoolId===child.schoolId&&b.weekday===day&&b.pickupTime===time);
    return includeExcluded||!(batch?.shared?batch.excludedStudentIds:excluded).includes(child.id);
   });
   if(matches){result.push({studentId:child.id,pickupStopId:stop.id,dropoffStopId:drop.id});break;}
  }
 }
 return result;
}
