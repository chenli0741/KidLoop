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
