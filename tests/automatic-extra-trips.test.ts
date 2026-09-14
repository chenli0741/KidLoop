import {test} from 'node:test';
import assert from 'node:assert/strict';
import {trialDay,type TrialInput} from '../src/lib/schedule-trial';
import {familiarityScore} from '../src/lib/driver-familiarity';
import {calculatePlan} from '../src/lib/rescheduling/planner';
import type {Snapshot,Intent} from '../src/lib/rescheduling/types';

export function extraFixture():TrialInput {
 const students=[{studentId:'k',pickupStopId:'a',dropoffStopId:'p'},{studentId:'older',pickupStopId:'a',dropoffStopId:'p'},{studentId:'other-school',pickupStopId:'b',dropoffStopId:'p'}];
 return {
  routes:[{id:'route',name:'A → B → Program',routeType:'RECURRING',startsOn:'2026-09-01',endsOn:'2026-09-30',weekdays:[1,2,3,4,5],driverId:'usual',vehicleId:'van',enabled:true,updatedAt:'',students,stops:[
   {id:'a',name:'A',address:'A',schoolId:'school-a',programId:null,time:'14:30',pickupTime:'14:30'},
   {id:'b',name:'B',address:'B',schoolId:'school-b',programId:null,time:'14:40',pickupTime:'14:30'},
   {id:'p',name:'Program',address:'P',schoolId:null,programId:'program',time:'14:50'},
  ]}],
  children:[{id:'k',schoolId:'school-a',programId:'program',grade:'K',reviewed:true},{id:'older',schoolId:'school-a',programId:'program',grade:'3',reviewed:true},{id:'other-school',schoolId:'school-b',programId:'program',grade:'1',reviewed:true}],
  rules:[{schoolId:'school-a',grades:['K','3'],weekdays:[1,2,3,4,5],pickupTime:'14:30'},{schoolId:'school-b',grades:['1'],weekdays:[1,2,3,4,5],pickupTime:'14:30'}],batches:[],
  terms:['school-a','school-b'].map(schoolId=>({schoolId,startsOn:'2026-09-01',endsOn:'2026-09-30'})),
  exceptions:[{schoolId:'school-a',startsOn:'2026-09-14',endsOn:'2026-09-18',pickupTime:null,gradeTimes:[{grades:['K'],time:'12:45'}]}],
  drivers:[{id:'usual',active:true,status:'AVAILABLE'},{id:'backup',active:true,status:'AVAILABLE'}],
  vehicles:[{id:'van',active:true,status:'AVAILABLE',capacity:4},{id:'spare',active:true,status:'AVAILABLE',capacity:4}],
  absences:[],travelTimes:[{fromName:'A',toName:'B',minutes:10},{fromName:'B',toName:'Program',minutes:10},{fromName:'A',toName:'Program',minutes:15},{fromName:'Program',toName:'A',minutes:20}],driverRuns:[],existing:[],
 };
}
const date='2026-09-15';
test('partial K early release adds a direct short run; normal times and other schools stay unchanged',()=>{
 const input=extraFixture(),saved=structuredClone(input),day=trialDay(input,date);
 assert.deepEqual(input,saved);assert.equal(day.plans.length,2);assert.deepEqual(day.issues,[]);
 const normal=day.plans.find(p=>!p.sourceRouteId)!,extra=day.plans.find(p=>p.sourceRouteId)!;
 assert.deepEqual(normal.stops.map(s=>s.time),['14:30','14:40','14:50']);assert.deepEqual(normal.students.map(s=>s.studentId),['older','other-school']);
 assert.deepEqual(extra.students.map(s=>s.studentId),['k']);assert.deepEqual(extra.stops.map(s=>[s.name,s.time]),[['A','12:45'],['Program','13:00']]);assert.equal(extra.driverId,'usual');assert.equal(extra.vehicleId,'van');
 assert.deepEqual(trialDay(input,date),day);assert.equal(trialDay(input,'2026-09-21').plans.length,1);
});
test('a 13:00 condition assigns the short run to an available backup and preserves the regular driver',()=>{
 const input=extraFixture();input.drivers[0].earliestDismissalTime='13:00';const day=trialDay(input,date);
 assert.equal(day.plans.find(p=>p.sourceRouteId)?.driverId,'backup');assert.equal(day.plans.find(p=>!p.sourceRouteId)?.driverId,'usual');
 input.drivers[1].status='OFF_DUTY';const blocked=trialDay(input,date);assert.equal(blocked.plans.length,1);assert.ok(blocked.issues.some(i=>i.code==='EXTRA_UNASSIGNED'));assert.ok(blocked.issues.some(i=>i.code==='UNASSIGNED'&&i.studentId==='k'));
});
test('historical route familiarity outweighs an unused default binding; future records do not teach',()=>{
 const input=extraFixture();input.driverRuns=[{driverId:'backup',routeId:'route',schoolIds:['school-a'],date:'2026-09-10'}];
 const extra=trialDay(input,date).plans.find(p=>p.sourceRouteId)!;assert.equal(extra.driverId,'backup');assert.match(extra.assignmentReason!,/熟悉度/);
 input.driverRuns[0].date='2026-09-16';assert.equal(trialDay(input,date).plans.find(p=>p.sourceRouteId)?.driverId,'usual');
 assert.ok(familiarityScore([{driverId:'d',routeId:'r',schoolIds:['s'],date:'2026-09-14'}],'d',['r'],'s',date)>familiarityScore([{driverId:'d',routeId:'r',schoolIds:['s'],date:'2026-06-14'}],'d',['r'],'s',date));
});
test('return travel and vehicle conflicts are hard constraints even with high familiarity',()=>{
 const input=extraFixture();input.travelTimes!.find(t=>t.fromName==='Program')!.minutes=120;
 const extra=trialDay(input,date).plans.find(p=>p.sourceRouteId)!;assert.equal(extra.driverId,'backup');assert.equal(extra.vehicleId,'spare');
 input.vehicles=input.vehicles.slice(0,1);assert.ok(!trialDay(input,date).plans.some(p=>p.sourceRouteId));
});
test('missing outbound travel never fabricates an extra run; absent and weekly-off children do not trigger it',()=>{
 const input=extraFixture();input.travelTimes=[];assert.ok(trialDay(input,date).issues.some(i=>i.code==='EXTRA_TRAVEL_MISSING'));
 input.absences=[{date,studentId:'k'}];assert.ok(!trialDay(input,date).plans.some(p=>p.sourceRouteId));
 input.absences=[];input.children[0].noPickupWeekdays=[2];assert.ok(!trialDay(input,date).plans.some(p=>p.sourceRouteId));
});
test('capacity and explicit temporary pickups prevent duplicate automatic runs',()=>{
 const input=extraFixture();input.vehicles.forEach(v=>v.capacity=0);assert.ok(!trialDay(input,date).plans.some(p=>p.sourceRouteId));
 const manual=extraFixture();manual.routes.push({...structuredClone(manual.routes[0]),id:'temporary',routeType:'TEMPORARY',driverId:'backup',vehicleId:'spare',excludedStudentIds:['older','other-school']});
 const day=trialDay(manual,date);assert.ok(!day.plans.some(p=>p.sourceRouteId));assert.equal(day.plans.filter(p=>p.students.some(s=>s.studentId==='k')).length,1);
});
test('shared school batches create exactly one early pickup',()=>{
 const input=extraFixture();input.routes.push({...structuredClone(input.routes[0]),id:'route-2',driverId:'backup',vehicleId:'spare'});
 input.batches=[{id:'shared-a',schoolId:'school-a',pickupTime:'14:30',weekday:2,shared:true,excludedStudentIds:[],updatedAt:''},{id:'shared-b',schoolId:'school-b',pickupTime:'14:30',weekday:2,shared:true,excludedStudentIds:[],updatedAt:''}];
 const day=trialDay(input,date);assert.equal(day.plans.filter(p=>p.sourceRouteId).length,1);assert.equal(day.plans.filter(p=>p.students.some(s=>s.studentId==='k')).length,1);
});
test('started students are retained without a second early pickup',()=>{
 const input=extraFixture();input.existing=[{date,routeId:'route',tripId:'started',driverId:'usual',vehicleId:'van',start:'14:30',end:'14:50',students:['k','older','other-school'],started:true,stops:input.routes[0].stops}];
 assert.ok(!trialDay(input,date).plans.some(p=>p.sourceRouteId));assert.ok(trialDay(input,date).issues.some(i=>i.code==='EXTRA_STARTED'));
});
test('AI rescheduling uses the same partial-grade direct extra plan',()=>{
 const input=extraFixture();
 const snapshot:Snapshot={term:{id:'term',startsOn:'2026-09-01',endsOn:'2026-09-30'},routes:input.routes,students:input.children.map(s=>({...s,name:s.id,reviewed:true})),drivers:input.drivers.map(d=>({...d,name:d.id})),vehicles:input.vehicles.map(v=>({...v,name:v.id})),travelTimes:input.travelTimes!,hash:'',days:[{date,matches:input.children.map(s=>({student_id:s.id,school_id:s.schoolId,time:'14:30'})),tasks:[],absentIds:[]}]};
 const intent:Intent={startsOn:date,endsOn:date,changes:[{schoolId:'school-a',grades:['K'],time:'12:45'}],unavailableDriverIds:[],unavailableVehicleIds:[],lockedRouteIds:[],preferExistingDrivers:true,noAdditionalDrivers:false,question:''};
 const result=calculatePlan(snapshot,intent);assert.ok(result.candidates.length,result.conflicts.join(';'));const after=result.candidates[0].days[0].after;
 assert.equal(after.length,2);assert.deepEqual(after.find(p=>p.automaticExtra)?.stops.map(s=>s.time),['12:45','13:00']);assert.deepEqual(after.find(p=>!p.automaticExtra)?.stops.map(s=>s.time),['14:30','14:40','14:50']);
});

test('explicit school preference outranks history, allows cover, and ONLY prevents unrelated assignments',()=>{
 const input=extraFixture();
 input.driverRuns=Array.from({length:40},()=>({driverId:'usual',routeId:'route',schoolIds:['school-a'],date:'2026-09-10'}));
 input.drivers[1].schoolPreferenceMode='PREFER';input.drivers[1].preferredSchoolIds=['school-a'];
 assert.equal(trialDay(input,date).plans.find(p=>p.sourceRouteId)?.driverId,'backup');
 input.drivers[1].preferredSchoolIds=['school-b'];input.drivers[0].earliestDismissalTime='13:00';
 assert.equal(trialDay(input,date).plans.find(p=>p.sourceRouteId)?.driverId,'backup','PREFER permits occasional cover');
 input.drivers[1].schoolPreferenceMode='ONLY';
 assert.ok(trialDay(input,date).issues.some(i=>i.code==='EXTRA_UNASSIGNED'));
 input.drivers[0].schoolPreferenceMode='ONLY';input.drivers[0].preferredSchoolIds=['school-a'];
 assert.ok(trialDay(input,date).issues.some(i=>i.code==='DRIVER_SCHOOL'),'mixed-school normal run violates ONLY');
});

test('latest dismissal bound is inclusive and applies to extra and normal trips',()=>{
 const input=extraFixture();input.drivers[0].earliestDismissalTime='13:00';input.drivers[1].latestDismissalTime='12:45';
 assert.equal(trialDay(input,date).plans.find(p=>p.sourceRouteId)?.driverId,'backup');
 input.drivers[1].latestDismissalTime='12:44';assert.ok(trialDay(input,date).issues.some(i=>i.code==='EXTRA_UNASSIGNED'));
 input.drivers[0].latestDismissalTime='14:00';assert.ok(trialDay(input,date).issues.some(i=>i.code==='DRIVER_TIME'));
});
