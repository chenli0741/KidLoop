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

test('an explicit dismissal time removes a contradictory restore-regular instruction',()=>{
 const intent:Intent={
  ...base,
  closures:[],
  restorations:[{schoolId:'school',startsOn:'2026-10-09',endsOn:'2026-10-09'}],
  changes:[{schoolId:'school',grades:['TK','K','1','2','3','4','5','6','7'],time:'12:45'}],
 };
 const normalized=normalizeIntent(intent);
 assert.deepEqual(normalized.restorations,[]);
 assert.deepEqual(normalized.changes,intent.changes);
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

test('a whole-school time applies only to the named school regardless of its route',()=>{
 const intent:Intent={...base,closures:[],changes:[{schoolId:'cumberland',grades:['TK','K','1','2','3','4','5','6','7'],time:'12:45'}]};
 const resolved=resolveIntentSchools(intent,{
  schools:[{id:'cumberland',name:'Cumberland'},{id:'cherry',name:'Cherry Chase'}],
  routes:[{id:'line',name:'Sunnyvale line',routeType:'RECURRING',startsOn:'2026-08-01',endsOn:'2026-12-31',stops:[
   {position:0,name:'Cumberland',address:'Sunnyvale',schoolId:'cumberland',programId:null},
   {position:1,name:'Cherry Chase',address:'Sunnyvale',schoolId:'cherry',programId:null},
   {position:2,name:'Little Tree',address:'Sunnyvale',schoolId:null,programId:'program'},
  ]}],
 },['今天 Cumberland 全校 12:45 放学']);
 assert.deepEqual(resolved.changes.map(change=>change.schoolId),['cumberland']);
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

test('empty whole-school grades are filled and provider-invented schools are discarded',()=>{
 const intent:Intent={...base,closures:[],changes:[
  {schoolId:'cumberland',grades:[],time:'12:45'},
  {schoolId:'ellis',grades:[],time:'12:45'},
 ]};
 const resolved=resolveIntentSchools(intent,{
  schools:[{id:'cumberland',name:'Cumberland'},{id:'cherry',name:'Cherry Chase'},{id:'ellis',name:'Ellis'}],
  routes:[
   {id:'wanted',name:'Cumberland line',routeType:'RECURRING',startsOn:'2026-08-01',endsOn:'2026-12-31',stops:[
    {position:0,name:'Cumberland',address:'Sunnyvale',schoolId:'cumberland',programId:null},
    {position:1,name:'Cherry Chase',address:'Sunnyvale',schoolId:'cherry',programId:null},
   ]},
   {id:'other',name:'Ellis line',routeType:'RECURRING',startsOn:'2026-08-01',endsOn:'2026-12-31',stops:[
    {position:0,name:'Ellis',address:'Sunnyvale',schoolId:'ellis',programId:null},
    {position:1,name:'Cumberland',address:'Sunnyvale',schoolId:'cumberland',programId:null},
   ]},
  ],
 },['今天 Cumberland 12:45 放学']);
 assert.deepEqual(resolved.changes.map(change=>change.schoolId),['cumberland']);
 assert.ok(resolved.changes.every(change=>change.grades.length===9));
});

test('a named city resolves schools by their own addresses instead of a route destination',()=>{
 const intent:Intent={...base,closures:[],changes:[],question:'Which school?'};
 const resolved=resolveIntentSchools(intent,{
  schools:[
   {id:'cumberland',name:'Cumberland',address:'824 Cumberland Dr, Sunnyvale, CA 94087'},
   {id:'cherry',name:'Cherry Chase',address:'1138 Heatherstone Way, Sunnyvale, CA 94087'},
   {id:'ellis',name:'Ellis',address:'550 E Olive Ave, Sunnyvale, CA 94086'},
   {id:'cupertino',name:'Cupertino School',address:'10301 Vista Dr, Cupertino, CA 95014'},
  ],
  routes:[
   {id:'sunnyvale',name:'LittleTree 1 Line',routeType:'RECURRING',startsOn:'2026-08-01',endsOn:'2026-12-31',stops:[
    {position:0,name:'Cumberland',address:'Sunnyvale',schoolId:'cumberland',programId:null},
    {position:1,name:'Cherry Chase',address:'Sunnyvale',schoolId:'cherry',programId:null},
    {position:2,name:'Little Tree Sunnyvale',address:'420 S Pastoria Ave, Sunnyvale, CA 94086',schoolId:null,programId:'little-tree'},
   ]},
   {id:'cupertino',name:'One Stop Line',routeType:'RECURRING',startsOn:'2026-08-01',endsOn:'2026-12-31',stops:[
    {position:0,name:'Ellis',address:'Sunnyvale',schoolId:'ellis',programId:null},
    {position:1,name:'One Stop',address:'20920 McClellan Rd, Cupertino, CA 95014',schoolId:null,programId:'one-stop'},
   ]},
  ],
 },['今天 Sunnyvale 早放学 12:45']);
 assert.equal(resolved.question,'');
 assert.deepEqual(resolved.changes.map(change=>change.schoolId).sort(),['cherry','cumberland','ellis']);
 assert.ok(resolved.changes.every(change=>change.time==='12:45'&&change.grades.length===9));
});

test('a named city ignores route count, overlap, destination, and driver when changing dismissal time',()=>{
 const intent:Intent={...base,startsOn:'2026-10-20',endsOn:'2026-10-20',closures:[],changes:[{schoolId:'cumberland',grades:[],time:'12:45'}],question:'找到多条线路，请说明线路名称或司机'};
 const resolved=resolveIntentSchools(intent,{
  schools:[
   {id:'cumberland',name:'Cumberland',address:'824 Cumberland Dr, Sunnyvale, CA 94087'},
   {id:'cherry',name:'Cherry Chase',address:'1138 Heatherstone Way, Sunnyvale, CA 94087'},
   {id:'ellis',name:'Ellis',address:'550 E Olive Ave, Sunnyvale, CA 94086'},
  ],
  routes:[
   {id:'cherry-line',name:'Cumberland → Cherry Chase → Little Tree Sunnyvale',routeType:'RECURRING',startsOn:'2026-08-01',endsOn:'2026-12-31',driverId:'driver-one',stops:[
    {position:0,name:'Cumberland',address:'Sunnyvale',schoolId:'cumberland',programId:null},
    {position:1,name:'Cherry Chase',address:'Sunnyvale',schoolId:'cherry',programId:null},
    {position:2,name:'Little Tree Sunnyvale',address:'420 S Pastoria Ave, Sunnyvale, CA 94086',schoolId:null,programId:'little-tree'},
   ]},
   {id:'ellis-line',name:'Cumberland → Ellis → Another Program',routeType:'RECURRING',startsOn:'2026-08-01',endsOn:'2026-12-31',driverId:'driver-two',stops:[
    {position:0,name:'Cumberland',address:'Sunnyvale',schoolId:'cumberland',programId:null},
    {position:1,name:'Ellis',address:'Sunnyvale',schoolId:'ellis',programId:null},
    {position:2,name:'Another Program',address:'100 Main St, Cupertino, CA 95014',schoolId:null,programId:'another-program'},
   ]},
  ],
 },['今天 Sunnyvale 早放学 12:45']);
 assert.equal(resolved.question,'');
 assert.equal(resolved.startsOn,'2026-10-20');
 assert.equal(resolved.endsOn,'2026-10-20');
 assert.deepEqual(resolved.changes.map(change=>change.schoolId).sort(),['cherry','cumberland','ellis']);
 assert.ok(resolved.changes.every(change=>change.time==='12:45'&&change.grades.length===9));
});
