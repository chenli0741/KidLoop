import {test} from 'node:test';
import assert from 'node:assert/strict';
import {planRoute} from '../src/lib/route-plan';
import {trialDay,type TrialInput} from '../src/lib/schedule-trial';
import type {FixedRoute} from '../src/lib/fixed-route-types';

const stops=[
 {id:'mca',schoolId:'mca',programId:null,name:'McAuliffe',address:'A',time:'14:35',pickupTime:'14:35',dwellMinutes:10},
 {id:'one',schoolId:null,programId:'one',name:'One Stop',address:'B',time:'14:55'},
 {id:'str',schoolId:'str',programId:null,name:'Stratford',address:'C',time:'15:10',pickupTime:'15:10',dwellMinutes:5},
 {id:'morning',schoolId:null,programId:'morning',name:'Morningstar San Jose',address:'D',time:'15:25'},
];
const route:FixedRoute={id:'route',name:'McAuliffe → … → Morningstar San Jose',routeType:'RECURRING',startsOn:'2026-09-01',endsOn:'2026-12-18',weekdays:[4],driverId:'driver',vehicleId:'vehicle',enabled:true,updatedAt:'',stops,students:[
 {studentId:'mca-child',pickupStopId:'mca',dropoffStopId:'one'},
 {studentId:'str-child',pickupStopId:'str',dropoffStopId:'morning'},
]};
const travelTimes=[
 {fromName:'McAuliffe',toName:'One Stop',minutes:10},
 {fromName:'Stratford',toName:'Morningstar San Jose',minutes:10},
 {fromName:'Morningstar San Jose',toName:'McAuliffe',minutes:8},
];

test('a later school run drops an unused earlier school and program stop',()=>{
 const plan=planRoute(route,[{student_id:'str-child',school_id:'str',time:'15:10'}],travelTimes);
 assert.deepEqual(plan.stops.map(stop=>[stop.name,stop.time]),[['Stratford','15:10'],['Morningstar San Jose','15:25']]);
 assert.deepEqual(plan.students.map(student=>student.studentId),['str-child']);
});

test('early pickup is listed before the later school run and each uses its actual stops',()=>{
 const input:TrialInput={
  routes:[route],
  children:[
   {id:'mca-child',schoolId:'mca',programId:'one',grade:'K',reviewed:true},
   {id:'str-child',schoolId:'str',programId:'morning',grade:'1',reviewed:true},
  ],
  rules:[
   {schoolId:'mca',grades:['K'],weekdays:[4],pickupTime:'14:35'},
   {schoolId:'str',grades:['1'],weekdays:[4],pickupTime:'15:10'},
  ],
  batches:[],
  terms:['mca','str'].map(schoolId=>({schoolId,startsOn:'2026-09-01',endsOn:'2026-12-18'})),
  exceptions:[{schoolId:'mca',startsOn:'2026-10-01',endsOn:'2026-10-09',pickupTime:'13:10',gradeTimes:[]}],
  drivers:[{id:'driver',active:true,status:'AVAILABLE'}],
  vehicles:[{id:'vehicle',active:true,status:'AVAILABLE',capacity:13}],
  absences:[],travelTimes,
 };
 const day=trialDay(input,'2026-10-01');
 assert.deepEqual(day.plans.map(plan=>plan.stops[0].time),['13:10','15:10']);
 assert.deepEqual(day.plans[0].stops.map(stop=>stop.name),['McAuliffe','One Stop']);
 assert.deepEqual(day.plans[1].stops.map(stop=>stop.name),['Stratford','Morningstar San Jose']);
 assert.equal(day.plans[1].name,'Stratford → Morningstar San Jose');
 assert.ok(!day.issues.some(issue=>issue.routeId==='route'&&issue.message.includes('One Stop → Stratford')));
});
