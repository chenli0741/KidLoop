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
 return <div className={s.launch}><button type="button" aria-label={text(locale,'拍照识别','Scan pickup')} title={text(locale,'拍照识别','Scan pickup')} onClick={()=>{setInitialImage('');setOpen(true);}}><Camera/></button><span className={s.launchHint}>{text(locale,'可自动检查学生','Automatically check students')}</span>{open&&<CameraDialog initialImage={initialImage} trip={trip} locale={locale} onUpdated={onUpdated} close={()=>{setOpen(false);setInitialImage('');}}/>}</div>;
}
function CameraDialog({trip,locale,onUpdated,close,initialImage}:{trip:Trip;locale:Locale;onUpdated:(u:TripExecution)=>void;close:()=>void;initialImage:string}){
 const dialog=useRef<HTMLDialogElement>(null),video=useRef<HTMLVideoElement>(null),stream=useRef<MediaStream|null>(null),abort=useRef<AbortController|null>(null);
 const [shot,setShot]=useState(initialImage),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[progress,setProgress]=useState(''),[matches,setMatches]=useState<FaceMatch[]>([]),[selected,setSelected]=useState<string[]>([]),[chooserIndex,setChooserIndex]=useState<number|null>(null);
 const [saving,startTransition]=useTransition();const router=useRouter();
 const eligible=trip.riders.filter(r=>r.status==='SCHEDULED'&&!r.otherVehicle&&!r.parentAbsent);
 const stop=()=>{stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;};
 useEffect(()=>{dialog.current?.showModal();return()=>{abort.current?.abort();stream.current?.getTracks().forEach(t=>t.stop());};},[]);
 useEffect(()=>{
  if(shot)return;let canceled=false;
  void (async()=>{try{const media=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}},audio:false});if(canceled){media.getTracks().forEach(t=>t.stop());return;}stream.current=media;video.current!.srcObject=media;await video.current!.play();if(!canceled)setReady(true);}catch{if(!canceled)setError(text(locale,'无法打开相机，请允许相机权限后重试。','Camera unavailable. Allow camera access and retry.'));}})();
  return()=>{canceled=true;stream.current?.getTracks().forEach(t=>t.stop());};
 },[shot,locale]);
 async function capture(){
  if(!video.current?.videoWidth)return;const c=document.createElement('canvas'),v=video.current,scale=Math.min(1,1600/v.videoWidth);c.width=v.videoWidth*scale;c.height=v.videoHeight*scale;c.getContext('2d')!.drawImage(v,0,0,c.width,c.height);const image=c.toDataURL('image/jpeg',.85);c.width=c.height=1;
  await analyze(image);
 }
 async function analyze(image:string){
  abort.current?.abort();setMatches([]);setSelected([]);
  stop();setShot(image);setBusy(true);setError('');setProgress(text(locale,'正在加载本机识别模型…','Loading on-device models…'));const controller=new AbortController();abort.current=controller;
  try{const {recognizePickup}=await import('@/lib/pickup-camera/local-recognition');const result=await recognizePickup(image,trip.riders,controller.signal,(done,total)=>setProgress(text(locale,`正在对照学生照片 ${done}/${total}`,`Matching student photos ${done}/${total}`)));if(controller.signal.aborted)return;
   setMatches(result.matches);setSelected(result.matches.map(m=>m.assignmentId??''));setProgress(result.matches.length?text(locale,`检测到 ${result.matches.length} 张人脸；请核对标记后确认。`,`Detected ${result.matches.length} faces. Review labels and confirm.`):text(locale,'未检测到人脸，请重拍。','No faces detected. Retake the photo.'));
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
   if(!controller.signal.aborted)setProgress(result.matches.length?text(locale,`检测到 ${result.matches.length} 人 · 识别 ${recognized} 人 · 请核对后确认。`,`${result.matches.length} faces · ${recognized} matched · Review and confirm.`):text(locale,'未检测到人脸，请重拍。','No faces detected. Retake the photo.'));
  }catch(error){if(!controller.signal.aborted){setError(error instanceof Error&&error.message==='RECOGNITION_TIMEOUT'?text(locale,'识别等待超时，已停止。可以重拍或返回名单操作。','Scan timed out and stopped. Retake or return to the manifest.'):text(locale,'识别未完成，可以重拍或返回名单操作。','Scan failed. Retake or return to the manifest.'));setProgress('');}}finally{if(!controller.signal.aborted)setBusy(false);}
 }
 const analyzeInitial=useEffectEvent((image:string)=>{void analyze(image);});
 useEffect(()=>{if(initialImage)analyzeInitial(initialImage);},[initialImage]);
 function retake(){abort.current?.abort();setShot('');setMatches([]);setSelected([]);setError('');setProgress('');setReady(false);setBusy(false);}
 const pickupIds=selectablePickups(selected,trip.riders);
 const chooserRiders=chooserIndex===null?[]:eligible.filter(r=>!matches.some((match,index)=>index!==chooserIndex&&selected[index]===r.id));
 function confirm(){if(!pickupIds.length){close();return;}startTransition(async()=>{try{const ids=pickupIds;const update=await confirmPhotoPickup(trip.id,ids,await captureOperationLocation());onUpdated(update);close();router.refresh();}catch{setError(text(locale,'未保存：名单可能已被另一辆车更新，或座位不足。请刷新名单后重新确认。','Not saved: the manifest changed or capacity was exceeded. Refresh and review again.'));router.refresh();}});}
 return <dialog ref={dialog} className={s.dialog} onCancel={e=>{e.preventDefault();if(!saving)close();}} aria-label={text(locale,'拍照识别','Scan pickup')}><header className={s.header}><strong>{text(locale,'拍照识别','Scan pickup')}</strong><button type="button" disabled={saving} onClick={close} aria-label={text(locale,'关闭','Close')}><X/></button></header>
 <div className={s.frame}>{shot?<><img src={shot} alt={text(locale,'本次车内画面','Current cabin snapshot')}/>{matches.map((m,i)=>{const displayId=m.assignmentId??selected[i],displayRider=trip.riders.find(r=>r.id===displayId);return <div key={i} className={s.box} data-unknown={!displayId} style={{left:`${Math.max(0,m.face.x)*100}%`,top:`${Math.max(0,m.face.y)*100}%`,width:`${m.face.width*100}%`,height:`${m.face.height*100}%`}}><span>{i+1} · {displayRider?.name??text(locale,'未识别','Unknown')}{m.assignmentId&&!eligible.some(r=>r.id===m.assignmentId)?text(locale,'（非待接）',' (not pending)'):''}</span></div>})}</>:<video ref={video} muted playsInline autoPlay/>}</div>
 <p role="status">{progress}</p>{error&&<p className={s.error} role="alert">{error}</p>}
 {matches.map((match,i)=>{const rider=trip.riders.find(r=>r.id===match.assignmentId),chosen=trip.riders.find(r=>r.id===selected[i]),canPick=eligible.some(r=>r.id===match.assignmentId);return <div key={i} className={s.row}><span>{i+1}</span>{rider?<span className={s.lockedMatch}>{rider.name}{canPick?text(locale,' · 已配',' · Matched'):text(locale,' · 跳过',' · Skip')}</span>:chosen?<span className={s.lockedMatch}>{chosen.name} · {text(locale,'已选','Selected')}</span>:<button type="button" className={s.chooseButton} disabled={saving} onClick={()=>setChooserIndex(i)}>{text(locale,'选择','Choose')}</button>}</div>;})}
 {shot&&!busy&&<p className={s.notice}>{text(locale,'仅确认已选项目。','Only selected items are confirmed.')}</p>}
 <footer className={s.tools}><PickupGalleryButton locale={locale} disabled={busy||saving} onImage={image=>{void analyze(image);}}/>{!shot?<button type="button" onClick={()=>void capture()} disabled={!ready} aria-label={text(locale,'拍照','Capture')}><Camera/></button>:<><button type="button" disabled={saving} onClick={retake} aria-label={text(locale,'重拍','Retake')}><RotateCcw/></button><button type="button" onClick={confirm} disabled={busy||saving} className={s.confirm}><Check/>{pickupIds.length?text(locale,`确认 ${pickupIds.length} 人`,`Confirm ${pickupIds.length}`):text(locale,'完成','Done')}</button></>}</footer>
 {chooserIndex!==null&&<div className={s.chooserBackdrop} role="presentation" onClick={()=>setChooserIndex(null)}><section className={s.chooser} role="dialog" aria-modal="true" aria-labelledby="pickup-chooser-title" onClick={event=>event.stopPropagation()}><header className={s.chooserHeader}><strong id="pickup-chooser-title">{text(locale,'选择学生','Choose student')}</strong><button type="button" onClick={()=>setChooserIndex(null)} aria-label={text(locale,'关闭','Close')}><X/></button></header><p className={s.chooserHint}>{text(locale,'已占用的学生不会显示。','Assigned students are hidden.')}</p><div className={s.chooserOptions}>{chooserRiders.map(rider=><button type="button" key={rider.id} onClick={()=>{setSelected(old=>old.map((id,index)=>index===chooserIndex?rider.id:id));setChooserIndex(null);}}>{rider.name}<small>{rider.grade}</small></button>)}{!chooserRiders.length&&<p className={s.chooserEmpty}>{text(locale,'无可选学生','No students available')}</p>}</div></section></div>}
 </dialog>;
}
