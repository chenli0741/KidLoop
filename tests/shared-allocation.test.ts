import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sharedPickupBounds} from '../src/lib/shared-allocation';

test('shared pickup bounds reserve fixed riders and divide the entire pool without AI',()=>{
 const result=sharedPickupBounds(16,[{tripId:'cherry',availableSeats:8},{tripId:'ellis',availableSeats:10}]);
 assert.equal(result.feasible,true);
 assert.deepEqual(result.vehicles,[{tripId:'cherry',min:6,max:8},{tripId:'ellis',min:8,max:10}]);
});

test('shared pickup bounds deterministically reject insufficient combined seats',()=>{
 const result=sharedPickupBounds(16,[{tripId:'one',availableSeats:5},{tripId:'two',availableSeats:10}]);
 assert.equal(result.feasible,false);
 assert.deepEqual(result.vehicles,[{tripId:'one',min:6,max:5},{tripId:'two',min:11,max:10}]);
});

