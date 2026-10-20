import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeIntent,resolveIntentSchools} from '../src/lib/rescheduling/ai';
import type {Intent} from '../src/lib/rescheduling/types';

const base:Intent={
 startsOn:'2026-10-09',endsOn:'2026-10-09',
 closures:[{schoolId:'school',startsOn:'2026-10-09',endsOn:'2026-10-09'}],
 changes:[{schoolId:'school',grades:['K'],time:''}],
 unavailableDriverIds:[],unavailableVehicleIds:[],lockedRouteIds:[],
 preferExistingDrivers:true,noAdditionalDrivers:false,question:'',
};

test('a full school closure discards a redundant invalid dismissal time',()=>{
 const normalized=normalizeIntent(base);
 assert.deepEqual(normalized.changes,[]);
 assert.equal(base.changes.length,1,'normalization does not mutate the provider response');
});

test('a partial closure keeps a time change that can apply outside the closure',()=>{
 const intent={...base,endsOn:'2026-10-10'};
 assert.equal(normalizeIntent(intent).changes.length,1);
});

test('restoring the regular calendar discards a model-generated blank time change',()=>{
 const intent:Intent={
  ...base,
  closures:[],
  restorations:[{schoolId:'school',startsOn:'2026-10-09',endsOn:'2026-10-09'}],
 };
 const normalized=normalizeIntent(intent);
 assert.deepEqual(normalized.changes,[]);
 assert.equal(normalized.restorations?.length,1);
});

test('an unambiguous school named in the request repairs blank provider school IDs',()=>{
 const intent:Intent={
  ...base,closures:[],
  changes:[
   {schoolId:'',grades:['TK','K','1','2','3','4','5','6','7'],time:'12:45'},
   {schoolId:'',grades:['TK','K','1','2','3','4','5','6','7'],time:'12:45'},
  ],
 };
 const resolved=resolveIntentSchools(intent,{schools:[
  {id:'cumberland-id',name:'Cumberland Elementary',shortName:'Cumberland'},
  {id:'stratford-id',name:'Stratford School',shortName:'Stratford'},
 ]},['今天 Cumberland 全校 12:45 放学，司机 Chen 可以增加这一趟。']);
 assert.deepEqual(resolved.changes,[{
  schoolId:'cumberland-id',grades:['TK','K','1','2','3','4','5','6','7'],time:'12:45',
 }]);
});

test('ambiguous school mentions are not guessed',()=>{
 const intent:Intent={...base,closures:[],changes:[{schoolId:'',grades:['K'],time:'12:45'}]};
 const resolved=resolveIntentSchools(intent,{schools:[
  {id:'one',name:'Cumberland Elementary',shortName:'Cumberland'},
  {id:'two',name:'Stratford School',shortName:'Stratford'},
 ]},['Cumberland 和 Stratford 都调整']);
 assert.equal(resolved.changes[0].schoolId,'');
});

test('duplicate student names require school disambiguation before writing',()=>{
 const intent:Intent={...base,closures:[],changes:[],studentChanges:[{studentId:'laura-one',startsOn:'2026-10-09',endsOn:'2026-10-09',attending:false}]};
 const catalog={schools:[],students:[
  {id:'laura-one',name:'Laura',schoolId:'one',schoolName:'Cumberland',grade:'K'},
  {id:'laura-two',name:'Laura',schoolId:'two',schoolName:'Stratford',grade:'1'},
 ]};
 const unresolved=resolveIntentSchools(intent,catalog,['Laura 今天不接']);
 assert.match(unresolved.question,/Cumberland/);
 assert.match(unresolved.question,/Stratford/);
 const resolved=resolveIntentSchools(intent,catalog,['Cumberland 的 Laura 今天不接']);
 assert.equal(resolved.question,'');
 assert.equal(resolved.studentChanges?.[0].studentId,'laura-one');
});

test('a whole-school anchor time expands to every pickup school on its configured line',()=>{
 const intent:Intent={...base,closures:[],changes:[{schoolId:'cumberland',grades:['TK','K','1','2','3','4','5','6','7'],time:'12:45'}]};
 const resolved=resolveIntentSchools(intent,{
  schools:[{id:'cumberland',name:'Cumberland'},{id:'cherry',name:'Cherry Chase'}],
  routes:[{id:'line',name:'Sunnyvale line',routeType:'RECURRING',startsOn:'2026-08-01',endsOn:'2026-12-31',stops:[
   {position:0,name:'Cumberland',address:'Sunnyvale',schoolId:'cumberland',programId:null},
   {position:1,name:'Cherry Chase',address:'Sunnyvale',schoolId:'cherry',programId:null},
   {position:2,name:'Little Tree',address:'Sunnyvale',schoolId:null,programId:'program'},
  ]}],
 },['今天 Cumberland 全校 12:45 放学']);
 assert.deepEqual(resolved.changes.map(change=>change.schoolId).sort(),['cherry','cumberland']);
});

test('an explicit school-only request does not expand across the line',()=>{
 const intent:Intent={...base,closures:[],changes:[{schoolId:'cumberland',grades:['TK','K','1','2','3','4','5','6','7'],time:'12:45'}]};
 const resolved=resolveIntentSchools(intent,{
  schools:[{id:'cumberland',name:'Cumberland'},{id:'cherry',name:'Cherry Chase'}],
  routes:[{id:'line',name:'Sunnyvale line',routeType:'RECURRING',startsOn:'2026-08-01',endsOn:'2026-12-31',stops:[
   {position:0,name:'Cumberland',address:'Sunnyvale',schoolId:'cumberland',programId:null},
   {position:1,name:'Cherry Chase',address:'Sunnyvale',schoolId:'cherry',programId:null},
  ]}],
 },['今天只调整 Cumberland 一个学校到 12:45']);
 assert.deepEqual(resolved.changes.map(change=>change.schoolId),['cumberland']);
});
