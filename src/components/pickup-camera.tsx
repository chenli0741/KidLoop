'use client';
/* eslint-disable @next/next/no-img-element -- Ephemeral in-memory camera frame; never use the image optimization server. */
import {useEffect,useEffectEvent,useRef,useState,useTransition} from 'react';
import {Camera,Check,RotateCcw,X} from 'lucide-react';
import {useRouter} from 'next/navigation';
import type {Trip} from '@/lib/types';
import {text,type Locale} from '@/lib/i18n';
import type {TripExecution} from '@/lib/trip-execution';
import {selectablePickups,type FaceMatch} from '@/lib/pickup-camera/matching';
import {captureOperationLocation} from '@/lib/capture-operation-location';
import {confirmPhotoPickup} from '@/app/driver/actions';
import s from './pickup-camera.module.css';
import {PickupGalleryButton} from './pickup-gallery-button';
export function PickupCamera({trip,locale,onUpdated}:{trip:Trip;locale:Locale;onUpdated:(u:TripExecution)=>void}){
 const [open,setOpen]=useState(false),[initialImage,setInitialImage]=useState('');
 return <div className={s.launch}><button type="button" aria-label={text(locale,'拍照识别','Scan pickup')} title={text(locale,'拍照识别','Scan pickup')} onClick={()=>{setInitialImage('');setOpen(true);}}><Camera/></button><PickupGalleryButton locale={locale} onImage={image=>{setInitialImage(image);setOpen(true);}}/>{open&&<CameraDialog initialImage={initialImage} trip={trip} locale={locale} onUpdated={onUpdated} close={()=>{setOpen(false);setInitialImage('');}}/>}</div>;
}
function CameraDialog({trip,locale,onUpdated,close,initialImage}:{trip:Trip;locale:Locale;onUpdated:(u:TripExecution)=>void;close:()=>void;initialImage:string}){
 const dialog=useRef<HTMLDialogElement>(null),video=useRef<HTMLVideoElement>(null),stream=useRef<MediaStream|null>(null),abort=useRef<AbortController|null>(null);
 const [shot,setShot]=useState(initialImage),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[progress,setProgress]=useState(''),[matches,setMatches]=useState<FaceMatch[]>([]),[selected,setSelected]=useState<string[]>([]),[belts,setBelts]=useState<Record<number,string>>({});
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
  await analyze(image);
 }
 async function analyze(image:string){
  abort.current?.abort();setMatches([]);setSelected([]);setBelts({});
  stop();setShot(image);setBusy(true);setError('');setProgress(text(locale,'正在加载本机识别模型…','Loading on-device models…'));const controller=new AbortController();abort.current=controller;
  try{const {recognizePickup}=await import('@/lib/pickup-camera/local-recognition');const result=await recognizePickup(image,trip.riders,controller.signal,(done,total)=>setProgress(text(locale,`正在对照学生照片 ${done}/${total}`,`Matching student photos ${done}/${total}`)));if(controller.signal.aborted)return;
   setMatches(result.matches);setSelected(result.matches.map(m=>m.assignmentId??''));setBusy(false);setProgress(result.matches.length?text(locale,`检测到 ${result.matches.length} 张人脸；请核对标记后确认。`,`Detected ${result.matches.length} faces. Review labels and confirm.`):text(locale,'未检测到人脸，请重拍。','No faces detected. Retake the photo.'));
   const recognized=result.matches.filter(m=>m.assignmentId).length;
   if(result.matches.length)setProgress(text(locale,`检测到 ${result.matches.length} 人 · 识别 ${recognized} 人 · 可用学生照片 ${result.usableReferences}/${trip.riders.length}`,`${result.matches.length} faces · ${recognized} matched · ${result.usableReferences}/${trip.riders.length} usable photos`));
   if(result.referenceIssues.length){const counts=(reason:string)=>result.referenceIssues.filter(r=>r.reason===reason).length;const parts=[
    counts('NO_PHOTO')?text(locale,`${counts('NO_PHOTO')} 人没有照片`,`${counts('NO_PHOTO')} missing photos`):'',
    counts('DEMO_PHOTO')?text(locale,'Test 账号使用替代头像，无法比对真人','Test account avatars cannot match real people'):'',
    counts('LOAD_FAILED')?text(locale,`${counts('LOAD_FAILED')} 张照片读取失败`,`${counts('LOAD_FAILED')} photos failed to load`):'',
    counts('NO_FACE')?text(locale,`${counts('NO_FACE')} 张参考照片未检测到人脸`,`${counts('NO_FACE')} reference photos have no detected face`):'',
    counts('MULTIPLE_FACES')?text(locale,`${counts('MULTIPLE_FACES')} 张参考照片有多个人脸`,`${counts('MULTIPLE_FACES')} reference photos contain multiple faces`):'',
    counts('PROCESSING_FAILED')?text(locale,`${counts('PROCESSING_FAILED')} 张参考照片处理失败`,`${counts('PROCESSING_FAILED')} reference photos failed processing`):''
   ];setError(parts.filter(Boolean).join(' · '));}
   if(result.matches.length){try{const response=await fetch('/api/pickup-camera/seatbelts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tripId:trip.id,image,faces:result.matches.map((m,index)=>({index,...m.face}))}),signal:controller.signal});if(!response.ok)throw new Error();const data=await response.json();if(!controller.signal.aborted)setBelts(Object.fromEntries(data.results.map((r:{index:number;status:string})=>[r.index,r.status])));}catch{if(!controller.signal.aborted)setBelts(Object.fromEntries(result.matches.map((_,i)=>[i,'UNAVAILABLE'])));}}
  }catch{if(!controller.signal.aborted){setError(text(locale,'识别未完成，请重拍或关闭后重试。','Scan failed. Retake or close and retry.'));setProgress('');}}finally{if(!controller.signal.aborted)setBusy(false);}
 }
 const analyzeInitial=useEffectEvent((image:string)=>{void analyze(image);});
 useEffect(()=>{if(initialImage)analyzeInitial(initialImage);},[initialImage]);
 function retake(){abort.current?.abort();setShot('');setMatches([]);setSelected([]);setBelts({});setError('');setProgress('');setReady(false);setBusy(false);}
 function confirm(){startTransition(async()=>{try{const ids=selectablePickups(selected,trip.riders);const update=await confirmPhotoPickup(trip.id,ids,await captureOperationLocation());onUpdated(update);close();router.refresh();}catch{setError(text(locale,'未保存：名单可能已被另一辆车更新，或座位不足。请刷新名单后重新确认。','Not saved: the manifest changed or capacity was exceeded. Refresh and review again.'));router.refresh();}});}
 const beltLabel=(status?:string)=>status==='VISIBLE'?text(locale,'可见安全带','Belt visible'):status==='CHECK'?text(locale,'疑似未系，请查看','Check belt'):status==='UNCLEAR'?text(locale,'安全带看不清','Belt unclear'):status==='UNAVAILABLE'?text(locale,'安全带辅助暂不可用','Belt check unavailable'):text(locale,'安全带分析中…','Checking belts…');
 return <dialog ref={dialog} className={s.dialog} onCancel={e=>{e.preventDefault();if(!saving)close();}} aria-label={text(locale,'拍照识别','Scan pickup')}><header className={s.header}><strong>{text(locale,'拍照识别','Scan pickup')}</strong><button type="button" disabled={saving} onClick={close} aria-label={text(locale,'关闭','Close')}><X/></button></header>
 <div className={s.frame}>{shot?<><img src={shot} alt={text(locale,'本次车内画面','Current cabin snapshot')}/>{matches.map((m,i)=><div key={i} className={s.box} data-unknown={!selected[i]} style={{left:`${Math.max(0,m.face.x)*100}%`,top:`${Math.max(0,m.face.y)*100}%`,width:`${m.face.width*100}%`,height:`${m.face.height*100}%`}}><span>{i+1} · {trip.riders.find(r=>r.id===selected[i])?.name??text(locale,'未识别','Unknown')}{selected[i]&&!eligible.some(r=>r.id===selected[i])?text(locale,'（非待接）',' (not pending)'):''}{belts[i]==='CHECK'?' ⚠':''}</span></div>)}</>:<video ref={video} muted playsInline autoPlay/>}</div>
 <p role="status">{progress}</p>{error&&<p className={s.error} role="alert">{error}</p>}
 {matches.map((_,i)=><label key={i} className={s.row}><span>{i+1}</span><select disabled={saving} aria-label={text(locale,`第 ${i+1} 位学生`,`Student ${i+1}`)} value={trip.riders.some(r=>r.id===selected[i])?selected[i]:''} onChange={e=>setSelected(old=>old.map((id,j)=>j===i?e.target.value:id))}><option value="">{text(locale,'未识别','Unknown')}</option>{trip.riders.map(r=><option key={r.id} value={r.id} disabled={!eligible.some(e=>e.id===r.id)||selected.some((id,j)=>j!==i&&id===r.id)}>{r.name}{!eligible.some(e=>e.id===r.id)?text(locale,'（非待接）',' (not pending)'):''}</option>)}</select><small>{beltLabel(belts[i])}</small></label>)}
 <footer className={s.tools}><PickupGalleryButton locale={locale} disabled={busy||saving} onImage={image=>{void analyze(image);}}/>{!shot?<button type="button" onClick={()=>void capture()} disabled={!ready} aria-label={text(locale,'拍照','Capture')}><Camera/></button>:<><button type="button" disabled={saving} onClick={retake} aria-label={text(locale,'重拍','Retake')}><RotateCcw/></button><button type="button" onClick={confirm} disabled={busy||saving||!selectablePickups(selected,trip.riders).length} aria-label={text(locale,'确认接到','Confirm pickup')}><Check/></button><span>{selectablePickups(selected,trip.riders).length} {text(locale,'人待确认','selected')}</span></>}</footer></dialog>;
}
