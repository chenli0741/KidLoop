import {recognizePickup} from './recognition-engine';
self.onmessage=async(event:MessageEvent<{image:string;references:{id:string;photoUrl:string}[]}>)=>{
 try{
  const result=await recognizePickup(event.data.image,event.data.references,new AbortController().signal,(done,total)=>self.postMessage({type:'progress',done,total}));
  self.postMessage({type:'result',result});
 }catch{self.postMessage({type:'error'});}
};
