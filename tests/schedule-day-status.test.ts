import {test} from 'node:test';
import assert from 'node:assert/strict';
import {scheduleDayStatus} from '../src/lib/schedule-day-status';
import type {TripStatus} from '../src/lib/types';
const status=(...statuses:TripStatus[])=>scheduleDayStatus(statuses.map(status=>({status})));
test('schedule colors distinguish only days with trips and days without trips',()=>{
 assert.equal(status(),'empty');assert.equal(status('CANCELED'),'empty');
 assert.equal(status('DRAFT'),'planned');assert.equal(status('PUBLISHED'),'planned');
 assert.equal(status('COMPLETED','CANCELED'),'planned');
 assert.equal(status('COMPLETED','PUBLISHED'),'planned');
 assert.equal(status('IN_PROGRESS','PUBLISHED'),'planned');
 assert.equal(status('NEEDS_ATTENTION','IN_PROGRESS','COMPLETED'),'planned');
});
