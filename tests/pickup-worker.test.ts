import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runRecognitionWorker} from '../src/lib/pickup-camera/worker-task';
class FakeWorker {
 onmessage:((event:{data:unknown})=>void)|null=null;
 onerror:(()=>void)|null=null;onmessageerror:(()=>void)|null=null;
 terminated=0;posted=false;
 postMessage(){this.posted=true;}
 terminate(){this.terminated++;}
 emit(data:unknown){this.onmessage?.({data});}
}
test('finishing a scan terminates its worker and ignores late errors',async()=>{
 const worker=new FakeWorker(),controller=new AbortController(),progress:number[]=[];
 const task=runRecognitionWorker(()=>worker as unknown as Worker,{},controller.signal,done=>progress.push(done));
 worker.emit({type:'progress',done:2,total:3});worker.emit({type:'result',result:{matches:['a']}});
 assert.deepEqual(await task,{matches:['a']});controller.abort();worker.onerror?.();assert.equal(worker.terminated,1);assert.deepEqual(progress,[2]);
});
test('retake or closing interrupts the scan and releases its worker immediately',async()=>{
 const worker=new FakeWorker(),controller=new AbortController();const task=runRecognitionWorker(()=>worker as unknown as Worker,{},controller.signal,()=>{});
 controller.abort();await assert.rejects(task,{name:'AbortError'});assert.equal(worker.terminated,1);
});
test('a stuck model or network request times out instead of spinning indefinitely',async()=>{
 const worker=new FakeWorker();const task=runRecognitionWorker(()=>worker as unknown as Worker,{},new AbortController().signal,()=>{},5);
 await assert.rejects(task,/RECOGNITION_TIMEOUT/);assert.equal(worker.terminated,1);
});
test('an already canceled scan starts no worker',async()=>{
 const controller=new AbortController();controller.abort();let starts=0;
 await assert.rejects(runRecognitionWorker(()=>{starts++;return new FakeWorker() as unknown as Worker;},{},controller.signal,()=>{}),{name:'AbortError'});assert.equal(starts,0);
});
