import {test} from 'node:test';
import assert from 'node:assert/strict';
import {automaticRoster} from '../src/lib/automatic-roster';
import {trialDay,checkCapacity,type TrialInput} from '../src/lib/schedule-trial';
const stops=[{id:'s',schoolId:'school',programId:null,name:'School',address:'A',time:'14:00',pickupTime:'14:00'},{id:'c',schoolId:'cherry',programId:null,name:'Cherry',address:'B',time:'14:15',pickupTime:'14:00'},{id:'p',schoolId:null,programId:'program',name:'Program',address:'C',time:'14:30'}];
const children=[{id:'early',schoolId:'school',programId:'program',grade:'K',reviewed:true},{id:'normal',schoolId:'school',programId:'program',grade:'1',reviewed:true},{id:'cherry-child',schoolId:'cherry',programId:'program',grade:'1',reviewed:true}];
const rules=[{schoolId:'school',grades:['K'],weekdays:[5],pickupTime:'12:30'},{schoolId:'school',grades:['1'],weekdays:[5],pickupTime:'14:00'},{schoolId:'cherry',grades:['1'],weekdays:[5],pickupTime:'14:00'}];
const route={id:'r',name:'Route',routeType:'RECURRING' as const,startsOn:'2026-09-01',endsOn:'2026-12-18',weekdays:[5],driverId:'d',vehicleId:'v',enabled:true,updatedAt:'',stops,students:[]};
function input():TrialInput{return {routes:[route],children,rules,batches:[],terms:['school','cherry'].map(schoolId=>({schoolId,startsOn:'2026-09-01',endsOn:'2026-12-18'})),exceptions:[],drivers:[{id:'d',active:true,status:'AVAILABLE'}],vehicles:[{id:'v',active:true,status:'AVAILABLE',capacity:12}],absences:[]};}
test('school and dismissal batch determine riders; intermediate school is never their dropoff',()=>{
 const roster=automaticRoster(stops,children,rules,[5]);assert.deepEqual(roster.map(a=>a.studentId),['normal','cherry-child']);assert.equal(roster[0].dropoffStopId,'p');
 assert.equal(automaticRoster(stops,children,rules,[5],['normal']).length,1);
 assert.equal(automaticRoster(stops,children,rules,[5],['normal'],[],true).length,2);
});
test('missing riders checked after arranging; weekly no pickup, absence and holidays are excluded',()=>{
 const data=input();let day=trialDay(data,'2026-09-11');assert.ok(day.issues.some(i=>i.studentId==='early'&&i.code==='UNASSIGNED'));
 data.absences=[{date:'2026-09-11',studentId:'early'}];day=trialDay(data,'2026-09-11');assert.equal(day.issues.length,0);
 data.exceptions=[{schoolId:'school',startsOn:'2026-09-11',endsOn:'2026-09-11',pickupTime:null,gradeTimes:[]}];assert.equal(trialDay(data,'2026-09-11').expected,1);
});
test('shared batch applies to all routes and exclusions follow batch, not individual route',()=>{
 const data=input();data.absences=[{date:'2026-09-11',studentId:'early'}];
 data.routes.push({...route,id:'r2',driverId:'d2',vehicleId:'v2'});data.drivers.push({id:'d2',active:true,status:'AVAILABLE'});data.vehicles.push({id:'v2',active:true,status:'AVAILABLE',capacity:12});
 data.batches=['school','cherry'].map(schoolId=>({id:schoolId,schoolId,pickupTime:'14:00',weekday:5,shared:true,excludedStudentIds:[],updatedAt:''}));
 assert.equal(trialDay(data,'2026-09-11').issues.length,0);
 data.batches[0].excludedStudentIds=['normal'];const day=trialDay(data,'2026-09-11');assert.ok(day.plans.every(p=>!p.students.some(s=>s.studentId==='normal')));assert.ok(day.issues.some(i=>i.studentId==='normal'&&i.code==='UNASSIGNED'));
});
test('capacity uses segments and fixed reservations across multiple shared cars',()=>{
 const p=trialDay(input(),'2026-09-11').plans[0];
 const plan={...p,students:[{studentId:'a',pickupStopId:'s',dropoffStopId:'c'},{studentId:'b',pickupStopId:'c',dropoffStopId:'p'}]};
 assert.equal(checkCapacity([plan],[{id:'v',active:true,status:'AVAILABLE',capacity:1}]),true);
 const one={...p,students:Array.from({length:15},(_,i)=>({studentId:'shared'+i,pickupStopId:'s',dropoffStopId:'p'}))};
 const two={...one,vehicleId:'v2',students:[...one.students,...Array.from({length:5},(_,i)=>({studentId:'fixed'+i,pickupStopId:'c',dropoffStopId:'p'}))]};
 assert.equal(checkCapacity([one,two],[{id:'v',active:true,status:'AVAILABLE',capacity:12},{id:'v2',active:true,status:'AVAILABLE',capacity:12}]),true);
 assert.equal(checkCapacity([one,two],[{id:'v',active:true,status:'AVAILABLE',capacity:9},{id:'v2',active:true,status:'AVAILABLE',capacity:9}]),false);
});

test('a later driver cannot silently collect an earlier dismissal batch',()=>{
 const late=[{...stops[0],time:'14:30',pickupTime:undefined},stops[2]];
 assert.equal(automaticRoster(late,[children[0]],rules,[5]).length,0);
});

test('a separate temporary service picks up children excluded from the shared batch without taking its other riders',()=>{
 const data=input();data.absences=[{date:'2026-09-11',studentId:'early'}];
 data.batches=[{id:'school',schoolId:'school',pickupTime:'14:00',weekday:5,shared:true,excludedStudentIds:['normal'],updatedAt:''}];
 data.routes.push({...route,id:'temporary',routeType:'TEMPORARY',driverId:'d2',vehicleId:'v2',excludedStudentIds:['cherry-child']});
 data.drivers.push({id:'d2',active:true,status:'AVAILABLE'});data.vehicles.push({id:'v2',active:true,status:'AVAILABLE',capacity:1});
 const day=trialDay(data,'2026-09-11');assert.deepEqual(day.issues,[]);
 assert.deepEqual(day.plans.find(p=>p.routeId==='temporary')?.students.map(a=>a.studentId),['normal']);
 assert.deepEqual(day.plans.find(p=>p.routeId==='temporary')?.shared,{});
 assert.deepEqual(day.plans.find(p=>p.routeId==='r')?.students.map(a=>a.studentId),['cherry-child']);
 assert.deepEqual(data.batches[0].excludedStudentIds,['normal']);
});
