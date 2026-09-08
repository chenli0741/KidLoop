"use client";

import {useId,useRef,useState,useTransition,type ReactNode} from "react";
import {ArrowRight,Check,CarFront} from "lucide-react";
import {useRouter} from "next/navigation";
import {LocationMap} from "./location-map";
import {finishSegment} from "@/app/driver/actions";
import {text,type Locale} from "@/lib/i18n";
import type {RouteStop} from "@/lib/fixed-route-types";

type Option={id:string;stops:RouteStop[];done:boolean;pendingPickups:number};
export function TripSegmentPicker({options,tripId,locale,interactive,children}:{
  options:Option[];tripId:string;locale:Locale;interactive:boolean;children:ReactNode[];
}) {
  const id=useId(),router=useRouter();
  const confirmation=useRef<HTMLDialogElement>(null);
  const current=options.findIndex(option=>!option.done);
  const [selected,setSelected]=useState<string|null>(null);
  const [error,setError]=useState('');
  const [pending,startTransition]=useTransition();
  const selectedIndex=options.findIndex(option=>option.id===selected);
  const index=selectedIndex>=0?selectedIndex:current>=0?current:options.length-1;
  const option=options[index];
  const cannotFinish=pending||index!==current||option.done||option.pendingPickups>0;
  function finish(){
    if(cannotFinish)return;
    setError('');
    startTransition(async()=>{
      try{
        await finishSegment(tripId,option.stops[0].id,option.stops.at(-1)!.id);
        confirmation.current?.close();
        setSelected(null);router.refresh();
      }catch{setError(text(locale,'无法完成，请刷新后重试。','Could not finish. Refresh and retry.'));}
    });
  }
  return <>
    <ol className="segment-route-list" aria-label={text(locale,'接送线路','Pickup routes')}>
      {options.map((item,i)=><li key={item.id} className={`segment-route-item ${i===index?'is-selected':''}`}>
        <div className="segment-route-marker">
          <span className="segment-current" aria-label={i===current?text(locale,'当前执行线路','Current running route'):undefined} title={i===current?text(locale,'当前执行线路','Current running route'):undefined}>{i===current?<CarFront size={16}/>:item.done?<Check size={16}/>:null}</span>
          <span>{i+1}</span>
        </div>
        <button type="button" className="segment-route-select" aria-pressed={i===index} aria-controls={`${id}-content`} onClick={()=>{setSelected(item.id);setError('')}}>
          <span className="segment-endpoint"><time>{item.stops[0].time}</time><strong>{item.stops[0].name}</strong></span>
          <ArrowRight size={18} aria-hidden="true"/>
          <span className="segment-endpoint"><time>{item.stops.at(-1)!.time}</time><strong>{item.stops.at(-1)!.name}</strong></span>
        </button>
        <div className="segment-route-maps"><LocationMap compact name={item.stops[0].name} address={item.stops[0].address}/><span/><LocationMap compact name={item.stops.at(-1)!.name} address={item.stops.at(-1)!.address}/></div>
        {item.done && <small className="segment-done">{text(locale,'已完成','Finished')}</small>}
      </li>)}
    </ol>
    <div id={`${id}-content`} key={option.id}>{children[index]}</div>
    {interactive && <div className="segment-finish">
      {option.done?<span><Check size={17}/>{text(locale,'本线路已完成','Route finished')}</span>:<>
        <button type="button" className="button primary" disabled={cannotFinish} onClick={()=>confirmation.current?.showModal()}><Check size={17}/>{pending?text(locale,'保存中','Saving'):text(locale,'完成本线路','Finish route')}</button>
        {option.pendingPickups>0 && <small>{text(locale,`${option.pendingPickups} 名学生接人状态待处理`,`${option.pendingPickups} pickups unresolved`)}</small>}
      </>}
      {error&&<p role="alert" className="form-message error">{error}</p>}
    </div>}
    <dialog ref={confirmation} className="record-dialog" aria-labelledby={`${id}-confirm`} onCancel={event=>{if(pending)event.preventDefault()}}>
      <h2 id={`${id}-confirm`}>{text(locale,'确认全部送达','Confirm all dropped off')}</h2>
      <p>{option.stops[0].name} → {option.stops.at(-1)!.name}</p>
      <p>{text(locale,'确认本线路所有乘车学生均已送达？未完成的学生将统一标记为已送达，缺席记录保持不变。','Confirm that every rider on this route has arrived? Unfinished riders will be marked Dropped off; absent riders remain absent.')}</p>
      {error&&<p role="alert" className="form-message error">{error}</p>}
      <div className="segment-finish">
        <button type="button" className="button secondary" disabled={pending} onClick={()=>confirmation.current?.close()}>{text(locale,'取消','Cancel')}</button>
        <button type="button" className="button primary confirm-dropoff" disabled={cannotFinish} onClick={finish}><Check size={17}/>{text(locale,'确认全部送达','Confirm all dropped off')}</button>
      </div>
    </dialog>
  </>;
}
