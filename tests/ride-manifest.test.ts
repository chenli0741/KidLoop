import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pickupProgress,rideManifest} from '../src/lib/ride-manifest';
import type {Trip} from '../src/lib/types';
const trip={status:'IN_PROGRESS',progressState:'AT_STOP',currentStopIndex:1,routeStops:[{id:'school',schoolId:'school'},{id:'program',programId:'program'}],riders:[
 {id:'delivered',status:'DROPPED_OFF',pickupStopId:'school',dropoffStopId:'program'},
 {id:'aboard',status:'PICKED_UP',pickupStopId:'school',dropoffStopId:'later'},
 {id:'waiting',status:'SCHEDULED',pickupStopId:'later'},
 {id:'absent',status:'ABSENT',parentAbsent:true,pickupStopId:'school'},
 {id:'exception',status:'EXCEPTION',pickupStopId:'school'},
 {id:'other',status:'PICKED_UP',otherVehicle:'Other vehicle'}
]} as unknown as Trip;
test('travelling shows only children actually aboard regardless of selected stop',()=>{
 const result=rideManifest({...trip,progressState:'IN_TRANSIT'},'DRIVER',0);
 assert.equal(result.mode,'onboard');assert.deepEqual(result.riders.map(r=>r.id),['aboard']);
});
test('empty transfer clears delivered students without deleting history',()=>{
 const result=rideManifest({...trip,progressState:'IN_TRANSIT',riders:trip.riders.filter(r=>r.id!=='aboard')},'DRIVER');
 assert.equal(result.riders.length,0);assert.equal(trip.riders.length,6);
});
test('finished ride shows all stops and all final outcomes regardless of selected stop',()=>{
 const result=rideManifest({...trip,status:'COMPLETED'},'DRIVER',1);
 assert.equal(result.mode,'completed');assert.deepEqual(result.riders,trip.riders);
});
test('at a stop retains current destination delivery roster and partial delivery',()=>{
 const result=rideManifest(trip,'DRIVER',1);
 assert.equal(result.mode,'stop');assert.deepEqual(result.riders.map(r=>r.id),['delivered']);
});
test('pickup progress counts picked and waiting riders without absences, exceptions, or other vehicles',()=>{
 const progress=pickupProgress(trip.riders);
 assert.deepEqual(progress,{pickedUp:2,waiting:1});
});
