"use client";

import {useId,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {CalendarDays} from 'lucide-react';
import {text,type Locale} from '@/lib/i18n';

export function DriverDatePicker({date,locale,week,view}:{date:string;locale:Locale;week?:string;view?:string}){
 const router=useRouter();
 const dialog=useRef<HTMLDialogElement>(null);
 const [selected,setSelected]=useState(date);
 const id=useId();
 return <>
  <button type="button" className="driver-date-trigger" aria-label={text(locale,'选择行程日期','Choose ride date')} aria-haspopup="dialog" onClick={()=>{setSelected(date);dialog.current?.showModal();}}><CalendarDays size={24}/></button>
  <dialog ref={dialog} className="record-dialog driver-date-dialog" aria-labelledby={`${id}-title`}>
   <form onSubmit={event=>{
    event.preventDefault();
    if(!selected)return;
    const params=new URLSearchParams({date:selected});
    if(week){params.set('week',week);params.set('view',view==='month'?'month':'week');}
    dialog.current?.close();
    router.push(`/driver?${params}`);
   }}>
    <h2 id={`${id}-title`}>{text(locale,'选择行程日期','Choose ride date')}</h2>
    <label htmlFor={`${id}-date`}>{text(locale,'日期','Date')}</label>
    <input id={`${id}-date`} type="date" required value={selected} onChange={event=>setSelected(event.target.value)}/>
    <div className="record-dialog-footer">
     <button type="button" className="button secondary" onClick={()=>dialog.current?.close()}>{text(locale,'取消','Cancel')}</button>
     <button type="submit" className="button primary" disabled={!selected}>{text(locale,'查看','View')}</button>
    </div>
   </form>
  </dialog>
 </>;
}
