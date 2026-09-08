"use client";
import Image from "next/image";
import { Camera, ImagePlus, UploadCloud } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocale } from "@/components/locale-provider";
import { text } from "@/lib/i18n";
import { compressPhoto, pickNativePhoto, pickerCanceled } from "@/lib/photo-client";

export function PhotoUpload({current="",required=false,purpose="student"}:{current?:string;required?:boolean;purpose?:"student"|"avatar"}) {
  const locale=useLocale(), fileRef=useRef<HTMLInputElement>(null), cameraRef=useRef<HTMLInputElement>(null), guard=useRef<HTMLInputElement>(null);
  const operation=useRef<AbortController|null>(null),locked=useRef(false);
  const [url,setUrl]=useState(""),[stage,setStage]=useState<""|"pick"|"upload">(""),[error,setError]=useState(""),[remove,setRemove]=useState(false),[dragging,setDragging]=useState(false);
  const busy=stage!=="";
  useEffect(()=>{
    const form=fileRef.current?.form, controller=operation, lock=locked;
    const reset=()=>{controller.current?.abort();lock.current=false;setUrl("");setRemove(false);setError("");setStage("");};
    form?.addEventListener("reset",reset);return()=>{controller.current?.abort();lock.current=false;form?.removeEventListener("reset",reset);};
  },[]);
  useEffect(()=>{guard.current?.setCustomValidity(busy?text(locale,"请等待照片处理完成。","Wait for the photo."):error || (required&&!url&&!current?text(locale,"请选择照片。","Choose a photo."):""));},[busy,error,url,current,required,locale]);
  const message=(e:unknown)=>{
    const code=e instanceof Error?e.message:"";
    if(code==='size')return text(locale,"照片不能超过 15 MB，请选择较小的照片。","Choose a photo under 15 MB.");
    if(code==='format')return text(locale,"无法读取这张照片，请选择 JPG、PNG 或 WebP；HEIC 可从 App 相册重新选择。","Cannot read this photo. Use JPG, PNG or WebP; reselect HEIC from the app photo library.");
    if(code==='401'||code==='403')return text(locale,"登录已过期或没有上传权限，请重新登录。","Please sign in again with upload permission.");
    if(code==='429')return text(locale,"今天上传次数较多，请稍后再试。","Upload limit reached. Try later.");
    return text(locale,"照片处理失败，请检查网络及相册／相机权限后重试。","Photo failed. Check the network and photo/camera permissions, then retry.");
  };
  async function start(source:File|'photos'|'camera') {
    if(locked.current)return;
    locked.current=true;const task=new AbortController();operation.current=task;setError("");setStage(typeof source==='string'?'pick':'upload');
    try {
      const file=typeof source==='string'?await pickNativePhoto(source):source;
      if(task.signal.aborted)return;
      if(!file){(source==='camera'?cameraRef:fileRef).current?.click();return;}
      setStage('upload');const blob=await compressPhoto(file);if(task.signal.aborted)return;
      const data=new FormData();data.set('photo',blob,'photo.jpg');
      const response=await fetch(`/api/photos?purpose=${purpose}`,{method:'POST',body:data,signal:task.signal});if(!response.ok)throw new Error(String(response.status));
      const result=await response.json();if(!task.signal.aborted){setUrl(result.url);setRemove(false);}
    }catch(e){if(!task.signal.aborted&&!pickerCanceled(e))setError(message(e));}
    finally{if(operation.current===task){locked.current=false;setStage('');}}
  }
  const preview=remove?'':url||current;
  return <div className="photo-upload full" aria-busy={busy}>
    <span>{purpose === "avatar" ? text(locale,"账号照片","Profile photo") : text(locale,"学生照片","Student photo")}</span>
    {preview && <Image src={preview} alt={text(locale,"照片预览","Photo preview")} width={96} height={96} unoptimized />}
    <div className="photo-source-actions">
      <button type="button" className="button secondary compact" disabled={busy} onClick={()=>void start('photos')}><ImagePlus size={17}/>{text(locale,"选择照片","Choose photo")}</button>
      <button type="button" className="button secondary compact" disabled={busy} onClick={()=>void start('camera')}><Camera size={17}/>{text(locale,"拍照","Take photo")}</button>
    </div>
    <input ref={fileRef} type="file" accept="image/*" hidden onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void start(file);}} />
    <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void start(file);}} />
    <div className={`photo-drop-zone${dragging?' dragging':''}`} tabIndex={busy?-1:0} aria-label={text(locale,"拖入或粘贴照片","Drop or paste a photo")} onDragOver={e=>{e.preventDefault();if(!busy)setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={e=>{e.preventDefault();setDragging(false);if(e.dataTransfer.files[0])void start(e.dataTransfer.files[0]);}} onPaste={e=>{const file=Array.from(e.clipboardData.items).find(i=>i.type.startsWith('image/'))?.getAsFile();if(file){e.preventDefault();void start(file);}}}>
      <UploadCloud size={21}/><span>{text(locale,"也可拖入照片，或点击这里粘贴截图","Or drop a photo here, or focus here and paste a screenshot")}</span>
    </div>
    <input type="hidden" name="photoUrl" value={url} />
    <input ref={guard} className="photo-validation" aria-label={text(locale,"照片上传状态","Photo upload status")} value={url} onChange={()=>{}} tabIndex={-1} />
    <p className="form-hint" role="status">{stage==='pick'?text(locale,"正在选择照片…","Choosing photo…"):stage==='upload'?text(locale,"正在压缩并上传…","Compressing and uploading…"):error || text(locale,"选择后自动上传，保存资料后生效。","Uploads on selection; save the form to apply.")}</p>
    {(url || error) && <button type="button" className="button secondary compact" disabled={busy} onClick={()=>{setUrl('');setError('');}}>{text(locale,"取消本次选择","Cancel selection")}</button>}
    {current && <label className="settings-checkbox"><input type="checkbox" name="removePhoto" checked={remove} onChange={e=>{setRemove(e.target.checked);setUrl('');setError('');}} disabled={busy} /><span>{text(locale,"移除现有照片","Remove current photo")}</span></label>}
  </div>;
}
