import type {FaceMatch} from './matching';
import {runRecognitionWorker} from './worker-task';
let worker:Worker|undefined;
export type {ReferenceIssue} from './recognition-engine';
export type RecognitionResult={matches:FaceMatch[];referenceIssues:import('./recognition-engine').ReferenceIssue[];usableReferences:number};
export function recognizePickup(image:string,references:{id:string;photoUrl:string}[],signal:AbortSignal,progress:(done:number,total:number)=>void){
 return runRecognitionWorker<RecognitionResult>(()=>worker??=new Worker(new URL('./recognition.worker.ts',import.meta.url)),{image,references},signal,progress,60000,true);
}
