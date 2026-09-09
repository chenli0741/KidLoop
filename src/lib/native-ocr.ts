import {Capacitor,registerPlugin} from '@capacitor/core';
export interface OCRResult {
 text:string;
 blocks:{text:string;confidence:number;box:{x:number;y:number;width:number;height:number}}[];
 languages:string[];width:number;height:number;
}
const OCR=registerPlugin<{
 capabilities():Promise<{onDevice:boolean;languages:string[]}>;
 recognize(options:{base64:string;languages?:string[]}):Promise<OCRResult>;
}>('KidLoopOCR');
function requireOCR(){
 if(!Capacitor.isNativePlatform()||!Capacitor.isPluginAvailable('KidLoopOCR'))throw new Error('Native OCR unavailable. Install the updated iPhone app.');
}
export async function nativeOCRCapabilities(){requireOCR();return OCR.capabilities();}
/** Local image contents only; no URLs and no cloud fallback. Boxes use top-left normalized coordinates. */
export async function recognizeImageText(image:Blob,languages?:string[]):Promise<OCRResult>{
 requireOCR();
 if(!image.size||image.size>15*1024*1024)throw new Error('Image must be under 15 MB.');
 const base64=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('Cannot read image'));reader.readAsDataURL(image);});
 return OCR.recognize({base64,languages});
}
