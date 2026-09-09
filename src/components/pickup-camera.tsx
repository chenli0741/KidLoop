'use client';
/* eslint-disable @next/next/no-img-element -- Ephemeral in-memory camera frame; never use the image optimization server. */
import {useEffect,useRef,useState,useTransition} from 'react';
import {Camera,Check,RotateCcw,X} from 'lucide-react';
import {useRouter} from 'next/navigation';
import type {Trip} from '@/lib/types';
import {text,type Locale} from '@/lib/i18n';
import type {TripExecution} from '@/lib/trip-execution';
import type {FaceMatch} from '@/lib/pickup-camera/matching';
import {captureOperationLocation} from '@/lib/capture-operation-location';
import {confirmPhotoPickup} from '@/app/driver/actions';
import s from './pickup-camera.module.css';
export function PickupCamera({trip,locale,onUpdated}:{trip:Trip;locale:Locale;onUpdated:(u:TripExecution)=>void}){
 const [open,setOpen]=useState(false);
 return <div className={s.launch}><button type="button" aria-label={text(locale,'拍照识别','Scan pickup')} title={text(locale,'拍照识别','Scan pickup')} onClick={()=>setOpen(true)}><Camera/></button>{open&&<CameraDialog trip={trip} locale={locale} onUpdated={onUpdated} close={()=>setOpen(false)}/>}</div>;
}
function CameraDialog({trip,locale,onUpdated,close}:{trip:Trip;locale:Locale;onUpdated:(u:TripExecution)=>void;close:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),video=useRef<HTMLVideoElement>(null),stream=useRef<MediaStream|null>(null),abort=useRef<AbortController|null>(null);
 const [shot,setShot]=useState(''),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[progress,setProgress]=useState(''),[matches,setMatches]=useState<FaceMatch[]>([]),[selected,setSelected]=useState<string[]>([]),[belts,setBelts]=useState<Record<number,string>>({});
 const [saving,startTransition]=useTransition();const router=useRouter();
 const eligible=trip.riders.filter(r=>r.status==='SCHEDULED'&&!r.otherVehicle&&!r.parentAbsent);
 const stop=()=>{stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;};
 useEffect(()=>{dialog.current?.showModal();return()=>{abort.current?.abort();stream.current?.getTracks().forEach(t=>t.stop());};},[]);
 useEffect(()=>{
  if(shot)return;let canceled=false;
  void (async()=>{try{const media=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});if(canceled){media.getTracks().forEach(t=>t.stop());return;}stream.current=media;video.current!.srcObject=media;await video.current!.play();if(!canceled)setReady(true);}catch{if(!canceled)setError(text(locale,'无法打开相机，请允许相机权限后重试。','Camera unavailable. Allow camera access and retry.'));}})();
  return()=>{canceled=true;stream.current?.getTracks().forEach(t=>t.stop());};
 },[shot,locale]);
 async function capture(){
  if(!video.current?.videoWidth)return;const c=document.createElement('canvas'),v=video.current,scale=Math.min(1,1600/v.videoWidth);c.width=v.videoWidth*scale;c.height=v.videoHeight*scale;c.getContext('2d')!.drawImage(v,0,0,c.width,c.height);const image=c.toDataURL('image/jpeg',.85);c.width=c.height=1;
  stop();setShot(image);setBusy(true);setError('');setProgress(text(locale,'正在加载本机识别模型…','Loading on-device models…'));const controller=new AbortController();abort.current=controller;
  try{const {recognizePickup}=await import('@/lib/pickup-camera/local-recognition');const result=await recognizePickup(image,eligible,controller.signal,(done,total)=>setProgress(text(locale,`正在对照学生照片 ${done}/${total}`,`Matching student photos ${done}/${total}`)));if(controller.signal.aborted)return;
   setMatches(result.matches);setSelected(result.matches.map(m=>m.assignmentId??''));setBusy(false);setProgress(result.matches.length?text(locale,`检测到 ${result.matches.length} 张人脸；请核对标记后确认。`,`Detected ${result.matches.length} faces. Review labels and confirm.`):text(locale,'未检测到人脸，请重拍。','No faces detected. Retake the photo.'));
   if(result.missingReferences.length)setError(text(locale,`${result.missingReferences.length} 位学生照片缺失或无法用于比对。`,`${result.missingReferences.length} reference photos could not be used.`));
   if(result.matches.length){try{const response=await fetch('/api/pickup-camera/seatbelts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tripId:trip.id,image,faces:result.matches.map((m,index)=>({index,...m.face}))}),signal:controller.signal});if(!response.ok)throw new Error();const data=await response.json();if(!controller.signal.aborted)setBelts(Object.fromEntries(data.results.map((r:{index:number;status:string})=>[r.index,r.status])));}catch{if(!controller.signal.aborted)setBelts(Object.fromEntries(result.matches.map((_,i)=>[i,'UNAVAILABLE'])));}}
  }catch{if(!controller.signal.aborted){setError(text(locale,'识别未完成，请重拍或关闭后重试。','Scan failed. Retake or close and retry.'));setProgress('');}}finally{if(!controller.signal.aborted)setBusy(false);}
 }
 function retake(){abort.current?.abort();setShot('');setMatches([]);setSelected([]);setBelts({});setError('');setProgress('');setReady(false);setBusy(false);}
 function confirm(){startTransition(async()=>{try{const ids=selected.filter(Boolean);const update=await confirmPhotoPickup(trip.id,ids,await captureOperationLocation());onUpdated(update);close();router.refresh();}catch{setError(text(locale,'未保存：名单可能已被另一辆车更新，或座位不足。请刷新名单后重新确认。','Not saved: the manifest changed or capacity was exceeded. Refresh and review again.'));router.refresh();}});}
 const beltLabel=(status?:string)=>status==='VISIBLE'?text(locale,'可见安全带','Belt visible'):status==='CHECK'?text(locale,'疑似未系，请查看','Check belt'):status==='UNCLEAR'?text(locale,'安全带看不清','Belt unclear'):status==='UNAVAILABLE'?text(locale,'安全带辅助暂不可用','Belt check unavailable'):text(locale,'安全带分析中…','Checking belts…');
 return <dialog ref={dialog} className={s.dialog} onCancel={e=>{e.preventDefault();if(!saving)close();}} aria-label={text(locale,'拍照识别','Scan pickup')}><header className={s.header}><strong>{text(locale,'拍照识别','Scan pickup')}</strong><button type="button" disabled={saving} onClick={close} aria-label={text(locale,'关闭','Close')}><X/></button></header>
 <div className={s.frame}>{shot?<><img src={shot} alt={text(locale,'本次车内画面','Current cabin snapshot')}/>{matches.map((m,i)=><div key={i} className={s.box} data-unknown={!selected[i]} style={{left:`${Math.max(0,m.face.x)*100}%`,top:`${Math.max(0,m.face.y)*100}%`,width:`${m.face.width*100}%`,height:`${m.face.height*100}%`}}><span>{i+1} · {eligible.find(r=>r.id===selected[i])?.name??text(locale,'未识别','Unknown')}{belts[i]==='CHECK'?' ⚠':''}</span></div>)}</>:<video ref={video} muted playsInline autoPlay/>}</div>
 <p className={s.notice}>{text(locale,'照片比对在本机运行。安全带辅助会将当前画面发送给 AI；KidLoop 不保存这张照片。','Photo matching runs on this device. Belt assistance sends this frame to AI; KidLoop does not save the photo.')}</p>
 <p role="status">{progress}</p>{error&&<p className={s.error} role="alert">{error}</p>}
 {matches.map((_,i)=><label key={i} className={s.row}><span>{i+1}</span><select disabled={saving} aria-label={text(locale,`第 ${i+1} 位学生`,`Student ${i+1}`)} value={eligible.some(r=>r.id===selected[i])?selected[i]:''} onChange={e=>setSelected(old=>old.map((id,j)=>j===i?e.target.value:id))}><option value="">{text(locale,'未识别','Unknown')}</option>{eligible.map(r=><option key={r.id} value={r.id} disabled={selected.some((id,j)=>j!==i&&id===r.id)}>{r.name}</option>)}</select><small>{beltLabel(belts[i])}</small></label>)}
 <footer className={s.tools}>{!shot?<button type="button" onClick={()=>void capture()} disabled={!ready} aria-label={text(locale,'拍照','Capture')}><Camera/></button>:<><button type="button" disabled={saving} onClick={retake} aria-label={text(locale,'重拍','Retake')}><RotateCcw/></button><button type="button" onClick={confirm} disabled={busy||saving||!selected.some(Boolean)||selected.some(id=>id&&!eligible.some(r=>r.id===id))} aria-label={text(locale,'确认接到','Confirm pickup')}><Check/></button><span>{selected.filter(Boolean).length} {text(locale,'人待确认','selected')}</span></>}</footer></dialog>;
}
