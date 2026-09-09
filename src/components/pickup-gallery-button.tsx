'use client';
import {useEffect,useRef,useState} from 'react';
import {ImagePlus} from 'lucide-react';
import {Capacitor} from '@capacitor/core';
import {compressPhoto,pickNativePhoto,pickerCanceled} from '@/lib/photo-client';
import {text,type Locale} from '@/lib/i18n';
// Temporary test entry. Set false and rebuild to remove both entry points.
export const pickupGalleryEnabled=process.env.NEXT_PUBLIC_PICKUP_GALLERY_ENABLED!=='false';
export function PickupGalleryButton({locale,onImage,disabled=false}:{locale:Locale;onImage:(image:string)=>void;disabled?:boolean}){
 const input=useRef<HTMLInputElement>(null),task=useRef<AbortController|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>()=>task.current?.abort(),[]);
 async function load(file?:File){
  if(disabled||task.current)return;
  const controller=new AbortController();task.current=controller;setBusy(true);setError('');
  try{
   const photo=file??await pickNativePhoto('photos');if(controller.signal.aborted)return;
   if(!photo)throw new Error('native-gallery-unavailable');
   const blob=await compressPhoto(photo);if(controller.signal.aborted)return;
   const image=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('Read failed'));reader.readAsDataURL(blob);});
   if(!controller.signal.aborted)onImage(image);
  }catch(e){if(!controller.signal.aborted&&!pickerCanceled(e)){const code=e instanceof Error?e.message:'';setError(code==='native-gallery-unavailable'?text(locale,'当前 App 相册组件不可用，请更新 App 后重试。','Photo library component unavailable. Update the app and retry.'):code==='size'?text(locale,'照片过大，请选择小于 15 MB 的照片。','Choose a photo smaller than 15 MB.'):text(locale,'照片读取失败，请重新选择 JPG 或 PNG 照片，并检查相册权限。','Could not read the photo. Try JPG or PNG and check photo-library permission.'));}}
  finally{if(!controller.signal.aborted){setBusy(false);task.current=null;}}
 }
 if(!pickupGalleryEnabled)return null;
 return <><button type="button" disabled={disabled||busy} aria-label={text(locale,'从相册选择','Choose from photos')} title={text(locale,'从相册选择','Choose from photos')} onClick={()=>{if(Capacitor.isNativePlatform())void load();else input.current?.click();}}><ImagePlus size={22}/></button><input ref={input} type="file" accept="image/*" hidden onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void load(file);}}/>{error&&<small role="alert">{error}</small>}</>;
}
