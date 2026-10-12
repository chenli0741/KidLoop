import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeIntent} from '../src/lib/rescheduling/ai';
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
