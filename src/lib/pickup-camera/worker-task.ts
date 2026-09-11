// Each scan owns its worker: timeout, retake and close release the entire WASM heap.
export function runRecognitionWorker<T>(create:()=>Worker,input:unknown,signal:AbortSignal,progress:(done:number,total:number)=>void,timeoutMs=60000,keepAlive=false):Promise<T>{
 return new Promise((resolve,reject)=>{
  if(signal.aborted){reject(new DOMException('Canceled','AbortError'));return;}
  const worker=create();let settled=false;
  const finish=(error?:Error,result?:T)=>{
   if(settled)return;settled=true;clearTimeout(timer);signal.removeEventListener('abort',cancel);if(!keepAlive||error)worker.terminate();
   if(error)reject(error);else resolve(result!);
  };
  const cancel=()=>finish(new DOMException('Canceled','AbortError'));
  const timer=setTimeout(()=>finish(new Error('RECOGNITION_TIMEOUT')),timeoutMs);
  signal.addEventListener('abort',cancel,{once:true});
  worker.onmessage=event=>{const data=event.data;if(data.type==='progress')progress(data.done,data.total);else if(data.type==='result')finish(undefined,data.result);else if(data.type==='error')finish(new Error('RECOGNITION_FAILED'));};
  worker.onerror=()=>finish(new Error('RECOGNITION_FAILED'));
  worker.onmessageerror=()=>finish(new Error('RECOGNITION_FAILED'));
  try{worker.postMessage(input);}catch{finish(new Error('RECOGNITION_FAILED'));}
 });
}
