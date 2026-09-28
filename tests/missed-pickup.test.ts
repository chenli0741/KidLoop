import {test} from 'node:test';
import assert from 'node:assert/strict';
import {driverDefaultMissedPickupReason,missedPickupReasons} from '../src/lib/missed-pickup';

test('driver special reason defaults to parent pickup',()=>{
 assert.equal(driverDefaultMissedPickupReason,'PICKED_UP_BY_PARENT');
 assert.deepEqual(missedPickupReasons.find(reason=>reason.id===driverDefaultMissedPickupReason),{
  id:'PICKED_UP_BY_PARENT',zh:'家长已接',en:'Picked up by parent',
 });
});
