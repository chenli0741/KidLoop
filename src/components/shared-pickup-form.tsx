'use client';
import {useState,useTransition} from 'react';
import {configureSharedPickup} from '@/app/shared-pickup-actions';
import {text,type Locale} from '@/lib/i18n';
import type {Trip} from '@/lib/types';
export function SharedPickupForm({trips,locale}:{trips:Trip[];locale:Locale}){
 const [pending,start]=useTransition(),[error,setError]=useState('');
 const available=trips.filter(t=>t.status==='PUBLISHED'&&!t.hasSharedPickups&&t.routeStops?.length);
 if(available.length<2)return null;
 const schools=[...new Map(available.flatMap(t=>t.routeStops??[]).filter(s=>s.schoolId).map(s=>[s.schoolId!,s.name])).entries()];
 return <details><summary>{text(locale,'共享接送名单','Share pickup manifest')}</summary><form action={form=>start(async()=>{setError('');try{await configureSharedPickup(form);}catch{setError(text(locale,'无法共享。请选择同日未开始、经过相同学校和目的地的两个车次，名单不能重复。','Choose two unstarted trips on the same day with matching pickup and destination stops and no duplicate riders.'));}})}>
 <p>{text(locale,'仅共享所选学校当日名单；其他学校的学生仍固定在原车次。','Shares this school’s daily riders only; other schools keep their assigned trip.')}</p>
 {['first','second'].map((name,i)=><label key={name}>{text(locale,`车次 ${i+1}`,`Trip ${i+1}`)}<select name={name} required defaultValue={available[i]?.id}>{available.map(t=><option key={t.id} value={t.id}>{t.vehicleName} · {t.routeName}</option>)}</select></label>)}
 <label>{text(locale,'学校','School')}<select name="school" required>{schools.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
 <button className="button secondary" disabled={pending}>{text(locale,'共享名单','Share manifest')}</button>{error&&<p role="alert">{error}</p>}
 </form></details>;
}
