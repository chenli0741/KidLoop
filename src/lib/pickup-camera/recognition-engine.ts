import * as ort from 'onnxruntime-web/wasm';
import {alignment,matchFaces,suppressFaces,type FaceBox} from './matching';

let detectorPromise:Promise<ort.InferenceSession>|undefined;
let recognizerPromise:Promise<ort.InferenceSession>|undefined;
const embeddingCache=new Map<string,{embedding?:Float32Array;reason?:ReferenceIssue['reason']}>();

function canvas(w:number,h:number){return new OffscreenCanvas(w,h);}
async function loadImage(url:string,signal:AbortSignal){const response=await fetch(new URL(url,self.location.origin),{signal:AbortSignal.any([signal,AbortSignal.timeout(8000)])});if(!response.ok)throw new Error('Image unavailable');return createImageBitmap(await response.blob());}
function tensor(c:OffscreenCanvas,bgr=false){
 const bytes=c.getContext('2d')!.getImageData(0,0,c.width,c.height).data,n=c.width*c.height,data=new Float32Array(n*3);
 for(let i=0;i<n;i++){data[i]=bytes[4*i+(bgr?2:0)];data[n+i]=bytes[4*i+1];data[2*n+i]=bytes[4*i+(bgr?0:2)];}
 return new ort.Tensor('float32',data,[1,3,c.height,c.width]);
}
export type ReferenceIssue={assignmentId:string;reason:'NO_PHOTO'|'DEMO_PHOTO'|'LOAD_FAILED'|'NO_FACE'|'MULTIPLE_FACES'|'PROCESSING_FAILED'};
export async function recognizePickup(imageUrl:string,references:{id:string;photoUrl:string}[],signal:AbortSignal,progress:(done:number,total:number)=>void){
 ort.env.wasm.wasmPaths=self.location.origin+'/onnx/';ort.env.wasm.numThreads=1;
 let image:ImageBitmap|undefined;
  let detector:ort.InferenceSession|undefined,recognizer:ort.InferenceSession|undefined;
 const check=()=>{if(signal.aborted)throw new DOMException('Canceled','AbortError');};
 try{
  detector=await (detectorPromise??=ort.InferenceSession.create('/models/pickup/yunet.onnx',{executionProviders:['wasm']}));check();
  async function detect(img:ImageBitmap){
   const scale=Math.min(640/img.width,640/img.height),input=canvas(640,640);input.getContext('2d')!.drawImage(img,0,0,img.width*scale,img.height*scale);
   const data=tensor(input,true);let output:ort.InferenceSession.ReturnType|undefined;
   try{output=await detector!.run({[detector!.inputNames[0]]:data});check();
   const faces:FaceBox[]=[];
   for(const stride of [8,16,32]){
    const cls=output[`cls_${stride}`].data as Float32Array,obj=output[`obj_${stride}`].data as Float32Array,box=output[`bbox_${stride}`].data as Float32Array,kps=output[`kps_${stride}`].data as Float32Array,size=640/stride;
    for(let i=0;i<size*size;i++){
     const score=Math.sqrt(Math.max(0,Math.min(1,cls[i]))*Math.max(0,Math.min(1,obj[i])));if(score<.55)continue;
     const col=i%size,row=Math.floor(i/size),w=Math.exp(box[i*4+2])*stride/scale,h=Math.exp(box[i*4+3])*stride/scale;
     const x=(col+box[i*4])*stride/scale-w/2,y=(row+box[i*4+1])*stride/scale-h/2;
     if(x>=img.width||y>=img.height||x+w<=0||y+h<=0)continue;
     faces.push({x,y,width:w,height:h,score,landmarks:Array.from({length:5},(_,j)=>({x:(kps[i*10+2*j]+col)*stride/scale,y:(kps[i*10+2*j+1]+row)*stride/scale}))});
    }
   }
   return suppressFaces(faces);
   }finally{data.dispose();if(output)Object.values(output).forEach(t=>t.dispose());input.width=input.height=1;}
  }
  async function embedding(img:ImageBitmap,face:FaceBox){
   const aligned=canvas(112,112),ctx=aligned.getContext('2d')!;ctx.setTransform(...alignment(face.landmarks));ctx.drawImage(img,0,0);
   const data=tensor(aligned);let output:ort.InferenceSession.ReturnType|undefined;
   try{output=await recognizer!.run({[recognizer!.inputNames[0]]:data});check();return Float32Array.from(output[recognizer!.outputNames[0]].data as Float32Array);}
   finally{data.dispose();if(output)Object.values(output).forEach(t=>t.dispose());aligned.width=aligned.height=1;}
  }
  image=await loadImage(imageUrl,signal);check();const faces=await detect(image),queries=[];
  if(!faces.length)return {matches:[],referenceIssues:[],usableReferences:0};
  recognizer=await (recognizerPromise??=ort.InferenceSession.create('/models/pickup/sface.onnx',{executionProviders:['wasm']}));check();
  for(const face of faces)queries.push({face,embedding:await embedding(image,face)});
  const known:{assignmentId:string;embedding:Float32Array}[]=[],issues:ReferenceIssue[]=[];
  for(const [i,r] of references.entries()){
   check();progress(i,references.length);
   // Test avatars and missing references must never produce invented identities.
   if(!r.photoUrl||r.photoUrl.startsWith('/demo-avatars/')){issues.push({assignmentId:r.id,reason:r.photoUrl?'DEMO_PHOTO':'NO_PHOTO'});continue;}
   const cached=embeddingCache.get(r.photoUrl);
   if(cached){if(cached.embedding)known.push({assignmentId:r.id,embedding:cached.embedding});else issues.push({assignmentId:r.id,reason:cached.reason??'PROCESSING_FAILED'});continue;}
   let photo:ImageBitmap;
   try{photo=await loadImage(r.photoUrl,signal);check();}catch{check();issues.push({assignmentId:r.id,reason:'LOAD_FAILED'});continue;}
   try{const found=await detect(photo);if(found.length!==1){const reason=found.length?'MULTIPLE_FACES':'NO_FACE';embeddingCache.set(r.photoUrl,{reason});issues.push({assignmentId:r.id,reason});continue;}const value=await embedding(photo,found[0]);embeddingCache.set(r.photoUrl,{embedding:value});known.push({assignmentId:r.id,embedding:value});}catch{check();embeddingCache.set(r.photoUrl,{reason:'PROCESSING_FAILED'});issues.push({assignmentId:r.id,reason:'PROCESSING_FAILED'});}finally{photo.close();}
  }
  progress(references.length,references.length);check();
  const matched=matchFaces(queries,known).map(r=>({...r,face:{...r.face,x:r.face.x/image!.width,y:r.face.y/image!.height,width:r.face.width/image!.width,height:r.face.height/image!.height,landmarks:[]}}));
  return {matches:matched,referenceIssues:issues,usableReferences:known.length};
  }finally{image?.close();}
}
