import * as ort from 'onnxruntime-web/wasm';
import {alignment,matchFaces,suppressFaces,type FaceBox} from './matching';

function canvas(w:number,h:number){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
async function loadImage(url:string){const img=new Image();img.src=url;await img.decode();return img;}
function tensor(c:HTMLCanvasElement,bgr=false){
 const bytes=c.getContext('2d')!.getImageData(0,0,c.width,c.height).data,n=c.width*c.height,data=new Float32Array(n*3);
 for(let i=0;i<n;i++){data[i]=bytes[4*i+(bgr?2:0)];data[n+i]=bytes[4*i+1];data[2*n+i]=bytes[4*i+(bgr?0:2)];}
 return new ort.Tensor('float32',data,[1,3,c.height,c.width]);
}
export async function recognizePickup(imageUrl:string,references:{id:string;photoUrl:string}[],signal:AbortSignal,progress:(done:number,total:number)=>void){
 ort.env.wasm.wasmPaths='/onnx/';ort.env.wasm.numThreads=1;
 let detector:ort.InferenceSession|undefined,recognizer:ort.InferenceSession|undefined;
 const check=()=>{if(signal.aborted)throw new DOMException('Canceled','AbortError');};
 try{
  detector=await ort.InferenceSession.create('/models/pickup/yunet.onnx',{executionProviders:['wasm']});check();
  recognizer=await ort.InferenceSession.create('/models/pickup/sface.onnx',{executionProviders:['wasm']});check();
  async function detect(img:HTMLImageElement){
   const scale=Math.min(640/img.naturalWidth,640/img.naturalHeight),input=canvas(640,640);input.getContext('2d')!.drawImage(img,0,0,img.naturalWidth*scale,img.naturalHeight*scale);
   const output=await detector!.run({[detector!.inputNames[0]]:tensor(input,true)});check();input.width=input.height=1;
   const faces:FaceBox[]=[];
   for(const stride of [8,16,32]){
    const cls=output[`cls_${stride}`].data as Float32Array,obj=output[`obj_${stride}`].data as Float32Array,box=output[`bbox_${stride}`].data as Float32Array,kps=output[`kps_${stride}`].data as Float32Array,size=640/stride;
    for(let i=0;i<size*size;i++){
     const score=Math.sqrt(Math.max(0,Math.min(1,cls[i]))*Math.max(0,Math.min(1,obj[i])));if(score<.6)continue;
     const col=i%size,row=Math.floor(i/size),w=Math.exp(box[i*4+2])*stride/scale,h=Math.exp(box[i*4+3])*stride/scale;
     const x=(col+box[i*4])*stride/scale-w/2,y=(row+box[i*4+1])*stride/scale-h/2;
     if(x>=img.naturalWidth||y>=img.naturalHeight||x+w<=0||y+h<=0)continue;
     faces.push({x,y,width:w,height:h,score,landmarks:Array.from({length:5},(_,j)=>({x:(kps[i*10+2*j]+col)*stride/scale,y:(kps[i*10+2*j+1]+row)*stride/scale}))});
    }
   }
   return suppressFaces(faces);
  }
  async function embedding(img:HTMLImageElement,face:FaceBox){
   const aligned=canvas(112,112),ctx=aligned.getContext('2d')!;ctx.setTransform(...alignment(face.landmarks));ctx.drawImage(img,0,0);
   const output=await recognizer!.run({[recognizer!.inputNames[0]]:tensor(aligned)});check();aligned.width=aligned.height=1;
   return Float32Array.from(output[recognizer!.outputNames[0]].data as Float32Array);
  }
  const image=await loadImage(imageUrl);check();const faces=await detect(image),queries=[];
  for(const face of faces)queries.push({face,embedding:await embedding(image,face)});
  const known:{assignmentId:string;embedding:Float32Array}[]=[],missing:string[]=[];
  for(const [i,r] of references.entries()){
   check();progress(i,references.length);
   // Test avatars and missing references must never produce invented identities.
   if(!r.photoUrl||r.photoUrl.startsWith('/demo-avatars/')){missing.push(r.id);continue;}
   try{const photo=await loadImage(r.photoUrl);check();const found=await detect(photo);if(found.length!==1){missing.push(r.id);continue;}known.push({assignmentId:r.id,embedding:await embedding(photo,found[0])});}catch(e){check();if(e instanceof DOMException&&e.name==='AbortError')throw e;missing.push(r.id);}
  }
  progress(references.length,references.length);check();
  const matched=matchFaces(queries,known).map(r=>({...r,face:{...r.face,x:r.face.x/image.naturalWidth,y:r.face.y/image.naturalHeight,width:r.face.width/image.naturalWidth,height:r.face.height/image.naturalHeight,landmarks:[]}}));
  return {matches:matched,missingReferences:missing};
 }finally{await detector?.release();await recognizer?.release();}
}
