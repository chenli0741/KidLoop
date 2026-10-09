import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {PoolClient,QueryResult} from 'pg';
import {advanceTripStopRecord} from '../src/lib/advance-trip-stop';
import type {AuthUser} from '../src/lib/types';

test('trip progression serializes only the current ride',async()=>{
 const tripId='11111111-1111-4111-8111-111111111111';
 const calls:{sql:string;args:unknown[]}[]=[];
 const client={query:async(sql:string,args:unknown[]=[]):Promise<QueryResult>=>{
  calls.push({sql,args});
  return {rows:[],rowCount:0} as unknown as QueryResult;
 }} as unknown as PoolClient;
 const user={id:'22222222-2222-4222-8222-222222222222',role:'DRIVER',driverId:'33333333-3333-4333-8333-333333333333'} as AuthUser;
 await assert.rejects(advanceTripStopRecord(client,user,tripId,'GO'),/unavailable/);
 assert.match(calls[0].sql,/hashtextextended/);
 assert.deepEqual(calls[0].args,[tripId]);
 assert.doesNotMatch(calls[0].sql,/pg_advisory_xact_lock\(70919009\)/);
});
