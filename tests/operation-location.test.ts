import {test} from 'node:test';
import assert from 'node:assert/strict';
import {captureOperationLocation} from '../src/lib/capture-operation-location';
import {normalizeOperationLocation} from '../src/lib/operation-location';
const sample={status:'CAPTURED' as const,latitude:37.4,longitude:-122.1,accuracyMeters:25,capturedAt:'2026-09-08T20:00:00.000Z'};
test('location is optional and malformed data becomes an audit outcome, never a proximity check',()=>{
 assert.deepEqual(normalizeOperationLocation(sample),sample);
 assert.equal(normalizeOperationLocation({...sample,latitude:-80,longitude:120}).status,'CAPTURED');
 for(const input of [null,undefined])assert.deepEqual(normalizeOperationLocation(input),{status:'NOT_PROVIDED'});
 for(const input of [{...sample,latitude:NaN},{...sample,longitude:181},{...sample,accuracyMeters:-1},{...sample,capturedAt:'wrong'},{status:{toString:1,valueOf:2}},'bad'])assert.deepEqual(normalizeOperationLocation(input),{status:'INVALID'});
 assert.deepEqual(normalizeOperationLocation({status:'DENIED',latitude:37,extra:'discard'}),{status:'DENIED'});
});
test('one-shot collection uses fresh position and returns failure instead of rejecting',async()=>{
 let count=0;
 const geo:Pick<Geolocation,'getCurrentPosition'>={getCurrentPosition(success,_error,options){count++;assert.equal(options?.maximumAge,0);success({coords:{latitude:37.4,longitude:-122.1,accuracy:25},timestamp:Date.parse(sample.capturedAt)} as GeolocationPosition);}};
 assert.deepEqual(await captureOperationLocation(geo),sample);assert.equal(count,1);
 for(const [code,status] of [[1,'DENIED'],[2,'UNAVAILABLE'],[3,'TIMEOUT']] as const){assert.deepEqual(await captureOperationLocation({getCurrentPosition(_ok,fail){fail!({code} as GeolocationPositionError);}}),{status});}
 assert.deepEqual(await captureOperationLocation({getCurrentPosition(){throw new Error('blocked');}}),{status:'UNAVAILABLE'});
});
test('unresponsive device resolves at bounded timeout',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 try{const result=captureOperationLocation({getCurrentPosition(){}});t.mock.timers.tick(5000);assert.deepEqual(await result,{status:'TIMEOUT'});}finally{t.mock.timers.reset();}
});
