import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyTripExecution, type TripExecution} from '../src/lib/trip-execution';
import type {Trip} from '../src/lib/types';

test('execution response updates the whole trip without losing roster details or accepting stale responses',()=>{
 const trip={id:'trip',executionVersion:'2026-09-08T00:00:00.000001',status:'PUBLISHED',completedSegments:[],riders:[{id:'rider',name:'Child',status:'SCHEDULED'}]} as unknown as Trip;
 const update:TripExecution={tripId:'trip',version:'2026-09-08T00:00:00.000002',status:'IN_PROGRESS',completedSegments:[],riders:[{id:'rider',status:'PICKED_UP'}]};
 const next=applyTripExecution(trip,update);
 assert.equal(next.riders[0].status,'PICKED_UP');assert.equal(next.riders[0].name,'Child');assert.equal(next.status,'IN_PROGRESS');
 assert.equal(applyTripExecution(next,{...update,version:trip.executionVersion!}),next);
 assert.equal(applyTripExecution(next,{...update,tripId:'another'}),next);
 const done=applyTripExecution(next,{...update,version:'2026-09-08T00:00:00.000003',status:'COMPLETED',completedSegments:['a:b'],riders:[{id:'rider',status:'DROPPED_OFF'}]});
 assert.deepEqual(done.completedSegments,['a:b']);assert.equal(done.riders[0].status,'DROPPED_OFF');
 const undone=applyTripExecution(done,{...update,version:'2026-09-08T00:00:00.000004'});
 assert.deepEqual(undone.completedSegments,[]);assert.equal(undone.riders[0].status,'PICKED_UP');
});

test('server reconciliation recovers a lost last-pickup response and rejects older snapshots',()=>{
 const trip={id:'trip',executionVersion:'2026-09-16T00:00:00.000001',status:'IN_PROGRESS',currentStopIndex:2,progressState:'AT_STOP',riders:[{id:'last',status:'SCHEDULED',pickupStopId:'school'}]} as unknown as Trip;
 const confirmed:TripExecution={tripId:'trip',version:'2026-09-16T00:00:01.000001',status:'IN_PROGRESS',currentStopIndex:2,progressState:'AT_STOP',completedSegments:[],riders:[{id:'last',status:'PICKED_UP'}]};
 const recovered=applyTripExecution(trip,confirmed);
 assert.equal(recovered.riders.filter(r=>r.pickupStopId==='school'&&r.status==='SCHEDULED').length,0);
 assert.equal(recovered.currentStopIndex,2);
 assert.equal(applyTripExecution(recovered,{...confirmed,version:trip.executionVersion!,riders:[{id:'last',status:'SCHEDULED'}]}),recovered);
});

test('independent rider saves merge even when their responses arrive out of order',()=>{
 const trip={id:'trip',executionVersion:'2026-09-25T20:00:00.000001',status:'IN_PROGRESS',completedSegments:[],riders:[
  {id:'one',status:'SCHEDULED'},{id:'two',status:'SCHEDULED'},
 ]} as unknown as Trip;
 const second=applyTripExecution(trip,{tripId:'trip',version:'2026-09-25T20:00:02.000001',status:'IN_PROGRESS',completedSegments:[],partial:true,riders:[{id:'two',status:'PICKED_UP'}]});
 const first=applyTripExecution(second,{tripId:'trip',version:'2026-09-25T20:00:01.000001',status:'IN_PROGRESS',completedSegments:[],partial:true,riders:[{id:'one',status:'PICKED_UP'}]});
 assert.deepEqual(first.riders.map(rider=>rider.status),['PICKED_UP','PICKED_UP']);
 assert.equal(first.executionVersion,'2026-09-25T20:00:02.000001');
});
