import {test} from 'node:test';
import assert from 'node:assert/strict';
import {driverRideOrder} from '../src/lib/ride-order';

test('driver rides put active work first and completed work last',()=>{
  assert.ok(driverRideOrder('IN_PROGRESS')<driverRideOrder('PUBLISHED'));
  assert.ok(driverRideOrder('PUBLISHED')<driverRideOrder('COMPLETED'));
});
