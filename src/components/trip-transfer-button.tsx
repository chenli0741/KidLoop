"use client";

import {useId,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {ArrowRightLeft,X} from 'lucide-react';
import {useLocale} from './locale-provider';
import {text} from '@/lib/i18n';

type Driver={id:string;name:string};

export function TripTransferButton({tripId}:{tripId:string}){
 const locale=useLocale(),router=useRouter(),dialog=useRef<HTMLDialogElement>(null),titleId=useId();
 const [drivers,setDrivers]=useState<Driver[]>([]),[driverId,setDriverId]=useState(''),[loading,setLoading]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState('');
 async function open(){
  setLoading(true);setError('');setDrivers([]);setDriverId('');dialog.current?.showModal();
  try{
   const response=await fetch(`/api/trip-transfer?trip=${tripId}`,{cache:'no-store',signal:AbortSignal.timeout(10000)});
   if(!response.ok)throw new Error();
   const result=await response.json() as {drivers:Driver[]};setDrivers(result.drivers);setDriverId(result.drivers[0]?.id??'');
  }catch{setError(text(locale,'无法读取可选司机，请重试。','Could not load drivers. Try again.'));}
  finally{setLoading(false);}
 }
 async function submit(event:React.FormEvent){
  event.preventDefault();if(!driverId||saving)return;setSaving(true);setError('');
  try{
   const response=await fetch('/api/trip-transfer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tripId,driverId})});
   if(!response.ok)throw new Error();
   dialog.current?.close();router.refresh();
  }catch{setError(text(locale,'转让失败，行程或司机账号可能已变化，请重试。','Transfer failed. The ride or driver account may have changed. Try again.'));}
  finally{setSaving(false);}
 }
 function close(){if(!saving)dialog.current?.close();}
 return <>
  <button type="button" className="trip-transfer-trigger icon-button" aria-label={text(locale,'转让行程','Transfer ride')} title={text(locale,'转让行程','Transfer ride')} onClick={()=>void open()}><ArrowRightLeft size={17}/></button>
  <dialog ref={dialog} className="record-dialog trip-transfer-dialog" aria-labelledby={titleId} onCancel={event=>{event.preventDefault();close();}}>
   <form onSubmit={submit}>
    <div className="record-dialog-heading"><h2 id={titleId}>{text(locale,'转让行程','Transfer ride')}</h2><button type="button" className="icon-button" disabled={saving} aria-label={text(locale,'关闭','Close')} onClick={close}><X size={18}/></button></div>
    {loading?<p role="status">{text(locale,'正在读取司机…','Loading drivers…')}</p>:drivers.length?<label><span>{text(locale,'转让给','Transfer to')}</span><select value={driverId} disabled={saving} required onChange={event=>setDriverId(event.target.value)}>{drivers.map(driver=><option key={driver.id} value={driver.id}>{driver.name}</option>)}</select></label>:!error?<p>{text(locale,'当前没有其他可登录司机。','No other signed-in driver is available.')}</p>:null}
    {error&&<p className="inline-error" role="alert">{error}</p>}
    <div className="record-dialog-footer"><button type="button" className="button secondary" disabled={saving} onClick={close}>{text(locale,'取消','Cancel')}</button><button type="submit" className="button primary" disabled={loading||saving||!driverId}>{saving?text(locale,'转让中…','Transferring…'):text(locale,'确认转让','Transfer')}</button></div>
   </form>
  </dialog>
 </>;
}
