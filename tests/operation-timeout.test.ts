import {test} from 'node:test';
import assert from 'node:assert/strict';
import {withOperationTimeout} from '../src/lib/operation-timeout';
test('a lost mutation response releases waiting without retrying the mutation',async()=>{
 let calls=0;const pending=()=>{calls++;return new Promise<void>(()=>{});};
 await assert.rejects(withOperationTimeout(pending(),10),/not confirmed/);
 assert.equal(calls,1);
});
test('successful and failed responses preserve their outcomes',async()=>{
 assert.equal(await withOperationTimeout(Promise.resolve('saved'),100),'saved');
 await assert.rejects(withOperationTimeout(Promise.reject(new Error('denied')),100),/denied/);
});
test('a late result after timeout does not overwrite a later reconciled state',async()=>{
 let resolve!:(value:string)=>void;
 const result=new Promise<string>(r=>{resolve=r;});let state='pending';
 await withOperationTimeout(result,10).then(v=>{state=v;},()=>{state='reconciled';});
 resolve('stale');await Promise.resolve();assert.equal(state,'reconciled');
});
