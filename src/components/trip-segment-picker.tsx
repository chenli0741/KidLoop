"use client";

import {useId,useState,useTransition,type ReactNode} from "react";
import {ArrowRight,Check,CarFront} from "lucide-react";
import {useRouter} from "next/navigation";
import {LocationMap} from "./location-map";
import {finishSegment} from "@/app/driver/actions";
import {text,type Locale} from "@/lib/i18n";
import type {RouteStop} from "@/lib/fixed-route-types";

type Option={id:string;stops:RouteStop[];done:boolean;remaining:number};
export function TripSegmentPicker({options,tripId,locale,interactive,children}:{
  options:Option[];tripId:string;locale:Locale;interactive:boolean;children:ReactNode[];
}) {
  const id=useId(),router=useRouter();
  const current=options.findIndex(option=>!option.done);
  const [selected,setSelected]=useState<string|null>(null);
  const [error,setError]=useState('');
  const [pending,startTransition]=useTransition();
  const selectedIndex=options.findIndex(option=>option.id===selected);
  const index=selectedIndex>=0?selectedIndex:current>=0?current:options.length-1;
  const option=options[index];
  function finish(){
    setError('');
    startTransition(async()=>{
      try{
        await finishSegment(tripId,option.stops[0].id,option.stops.at(-1)!.id);
        setSelected(null);router.refresh();
      }catch{setError(text(locale,'无法完成，请确认本段学生均已送达或缺席，并刷新重试。','Could not finish. All riders must be dropped off or absent. Refresh and retry.'));}
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
        <button type="button" className="button primary" disabled={pending||index!==current||option.remaining>0} onClick={finish}><Check size={17}/>{pending?text(locale,'保存中','Saving'):text(locale,'完成本线路','Finish route')}</button>
        {option.remaining>0 && <small>{text(locale,`${option.remaining} 名学生尚未完成`,`${option.remaining} riders unfinished`)}</small>}
      </>}
      {error&&<p role="alert" className="form-message error">{error}</p>}
    </div>}
  </>;
}
