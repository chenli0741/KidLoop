'use client';
import {useState} from 'react';
import {SettingsForm} from './settings-form';
import {saveRoute} from '@/app/schedule/actions';
import {automaticRoster,batchTime,type PickupBatch} from '@/lib/automatic-roster';
import type {FixedRoute,RouteStop} from '@/lib/fixed-route-types';
import type {Driver,Vehicle,School,Program,Student} from '@/lib/types';
import type {PickupSetting} from '@/lib/pickup-types';
import {text,type Locale} from '@/lib/i18n';
export function FixedRouteForm({operatingTermId,termStart,termEnd,initial,schools,programs,drivers,vehicles,students,rules,batches=[],locale}:{operatingTermId:string;termStart:string;termEnd:string;initial?:FixedRoute;schools:School[];programs:Program[];drivers:Driver[];vehicles:Vehicle[];students:Pick<Student,"id"|"name"|"grade"|"schoolId"|"programId">[];rules:(PickupSetting&{schoolId:string})[];batches?:PickupBatch[];today:string;locale:Locale}){
 const [routeType,setRouteType]=useState(initial?.routeType??'RECURRING');
 const [stops,setStops]=useState<RouteStop[]>(initial?.stops??[]);
 const [start,setStart]=useState(initial?.stops[0]?.time??'');
 const [days,setDays]=useState(initial?.weekdays??[1,2,3,4,5]);
 const [excluded,setExcluded]=useState(initial?.excludedStudentIds??[]);
 const [changes,setChanges]=useState<PickupBatch[]>([]);
 const current=[...batches.filter(b=>!changes.some(c=>c.schoolId===b.schoolId&&c.pickupTime===b.pickupTime&&c.weekday===b.weekday)),...changes];
 const candidates=automaticRoster(stops,students,rules,days,excluded,routeType==='TEMPORARY'?[]:current,true);
 const selected=new Set(automaticRoster(stops,students,rules,days,excluded,routeType==='TEMPORARY'?[]:current).map(a=>a.studentId));
 const patch=(id:string,data:Partial<RouteStop>)=>setStops(prev=>prev.map(s=>s.id===id?{...s,...data}:s));
 function policy(stop:RouteStop,shared:boolean,studentId?:string,checked?:boolean){
  const edits=days.map(day=>{
   const time=batchTime(stop,rules,day)!;
   const prior=current.find(b=>b.schoolId===stop.schoolId&&b.pickupTime===time&&b.weekday===day);
   const base:PickupBatch=prior??{id:'',schoolId:stop.schoolId!,pickupTime:time,weekday:day,shared:false,excludedStudentIds:[],updatedAt:''};
   return {...base,shared,excludedStudentIds:studentId?(checked?base.excludedStudentIds.filter(id=>id!==studentId):[...new Set([...base.excludedStudentIds,studentId])]):base.excludedStudentIds};
  });
  setChanges(prev=>[...prev.filter(b=>!edits.some(e=>e.schoolId===b.schoolId&&e.pickupTime===b.pickupTime&&e.weekday===b.weekday)),...edits]);
 }
 function location(id:string,value:string){
  const [kind,key]=value.split(':');const place=(kind==='school'?schools:programs).find(p=>p.id===key);
  patch(id,{schoolId:kind==='school'?key:null,programId:kind==='program'?key:null,name:place?.name??'',address:place?.address??'',pickupTime:undefined});
 }
 return <SettingsForm preserveValues action={saveRoute} submitLabel={text(locale,'保存线路','Save route')}>
  {Object.entries({operatingTermId,id:initial?.id??'',updatedAt:initial?.updatedAt??'',stops:JSON.stringify(stops.map((s,i)=>({...s,time:i===0?start:s.time,pickupTime:s.schoolId?batchTime(s,rules,days[0]):undefined,dwellMinutes:s.dwellMinutes??0}))),excludedStudentIds:JSON.stringify(excluded),batches:JSON.stringify(changes.filter(b=>days.includes(b.weekday)&&stops.some(s=>s.schoolId===b.schoolId&&batchTime(s,rules,b.weekday)===b.pickupTime)))}).map(([name,value])=><input type="hidden" key={name} name={name} value={value}/>)}
  <label className="full"><span>{text(locale,'线路名称','Route name')}</span><input name="name" defaultValue={initial?.name??''} placeholder={text(locale,'留空按站点命名','Leave blank to name from stops')}/></label>
  <label><span>{text(locale,'开始时间','Start time')}</span><input type="time" required value={start} onChange={e=>{setStart(e.target.value);if(stops[0])patch(stops[0].id,{time:e.target.value,pickupTime:undefined});}}/></label>
  <label><span>{text(locale,'线路类型','Route type')}</span><select name="routeType" value={routeType} onChange={e=>{setRouteType(e.target.value as FixedRoute["routeType"]);setChanges([]);}}><option value="RECURRING">{text(locale,'固定线路','Recurring route')}</option><option value="TEMPORARY">{text(locale,'临时接送','Temporary service')}</option></select></label>
  <label><span>{text(locale,'开始日期','Start date')}</span><input type="date" name="startsOn" defaultValue={initial?.startsOn??termStart} required/></label>
  <label><span>{text(locale,'结束日期','End date')}</span><input type="date" name="endsOn" defaultValue={initial?.endsOn??termEnd} required/></label>
  <fieldset className="pickup-checks full"><legend>{text(locale,'接送星期','Weekdays')}</legend>{[1,2,3,4,5,6,7].map(day=><label key={day}><input name="weekdays" type="checkbox" value={day} checked={days.includes(day)} onChange={e=>setDays(e.target.checked?[...days,day].sort():days.filter(d=>d!==day))}/>{(locale==='zh'?['周一','周二','周三','周四','周五','周六','周日']:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'])[day-1]}</label>)}</fieldset>
  <div className="full fixed-stop-list"><h3>{text(locale,'按顺序选择站点','Stops in travel order')}</h3>
   {stops.map((stop,index)=><div className="fixed-stop-editor" key={stop.id}>
    <div className="fixed-stop-heading"><strong>{index+1} · {stop.name}</strong>{[-1,1].map(direction=><button type="button" className="button secondary compact" key={direction} disabled={index+direction<0||index+direction>=stops.length} aria-label={text(locale,direction<0?'上移':'下移',direction<0?'Move up':'Move down')} onClick={()=>setStops(prev=>{const result=[...prev];[result[index],result[index+direction]]=[result[index+direction],result[index]];result[0]={...result[0],time:start};return result;})}>{direction<0?'↑':'↓'}</button>)}<button type="button" className="button secondary compact" onClick={()=>setStops(prev=>prev.filter(s=>s.id!==stop.id))}>{text(locale,'移除','Remove')}</button></div>
    <label><span>{text(locale,'学校或课外班','School or program')}</span><select required value={stop.schoolId?'school:'+stop.schoolId:stop.programId?'program:'+stop.programId:''} onChange={e=>location(stop.id,e.target.value)}><option value="" disabled>{text(locale,'选择站点','Choose stop')}</option>{schools.map(p=><option key={p.id} value={'school:'+p.id}>{p.name}</option>)}{programs.map(p=><option key={p.id} value={'program:'+p.id}>{p.name}</option>)}</select></label>
    {index>0&&<label><span>{text(locale,'预计到达时间','Arrival time')}</span><input type="time" required value={stop.time} onChange={e=>patch(stop.id,{time:e.target.value,pickupTime:undefined})}/></label>}
    <label><span>{text(locale,'预计停留分钟','Estimated stop minutes')}</span><input type="number" min="0" max="120" step="1" value={stop.dwellMinutes??0} onChange={e=>patch(stop.id,{dwellMinutes:Number(e.target.value)||0})}/></label>
    {stop.schoolId&&<label><span>{text(locale,'放学时段','Dismissal batch')}</span><select value={batchTime(stop,rules,days[0])??''} required onChange={e=>patch(stop.id,{pickupTime:e.target.value})}><option value="" disabled>{text(locale,'先设置学校放学规则','Configure school dismissal rules')}</option>{[...new Set(rules.filter(r=>r.schoolId===stop.schoolId&&r.weekdays?.some(d=>days.includes(d))).map(r=>r.pickupTime).filter((t):t is string=>!!t))].sort().map(t=><option key={t} value={t}>{t}</option>)}</select></label>}
   </div>)}
   <button type="button" className="button secondary" onClick={()=>setStops(prev=>[...prev,{id:crypto.randomUUID(),name:'',address:'',schoolId:null,programId:null,time:prev.length?'':start}])}>{text(locale,'＋ 添加站点','+ Add stop')}</button>
  </div>
  <fieldset className="full fixed-riders"><legend>{text(locale,'自动接送名单','Automatic rider list')} · <span aria-live="polite">{text(locale,`已选 ${selected.size} 人`,`${selected.size} selected`)}</span></legend>
   {stops.filter(s=>s.schoolId).map(stop=>{
    const shared=routeType!=='TEMPORARY'&&days.every(day=>current.some(b=>b.schoolId===stop.schoolId&&b.pickupTime===batchTime(stop,rules,day)&&b.weekday===day&&b.shared));
    const riders=candidates.filter(a=>a.pickupStopId===stop.id);
    return <div key={stop.id}><h3>{stop.name} · {batchTime(stop,rules,days[0])} · <span aria-live="polite">{text(locale,`已选 ${riders.filter(a=>selected.has(a.studentId)).length} 人`,`${riders.filter(a=>selected.has(a.studentId)).length} selected`)}</span></h3>{routeType!=='TEMPORARY'&&<label className="settings-checkbox"><input type="checkbox" checked={shared} onChange={e=>policy(stop,e.target.checked)}/><span>{text(locale,'这拨接送共享名单','Share this school pickup batch')}</span></label>}
     {shared&&<p className="form-hint">{text(locale,'参与这拨接送的线路使用同一份名单。','Participating routes use this same roster.')}</p>}
     {riders.map(a=>{const child=students.find(s=>s.id===a.studentId)!;return <label className="settings-checkbox fixed-rider" key={a.studentId}><input type="checkbox" checked={selected.has(a.studentId)} onChange={e=>{if(shared)policy(stop,true,a.studentId,e.target.checked);else setExcluded(prev=>e.target.checked?prev.filter(id=>id!==a.studentId):[...new Set([...prev,a.studentId])]);}}/><span>{child.name} · {child.grade}</span></label>;})}
     {!riders.length&&<p>{text(locale,'此时段暂无匹配学生。','No matching students in this batch.')}</p>}
    </div>;
   })}
   <p className="form-hint">{text(locale,'默认全部选中；另行接送可取消勾选。安排后在每日接送核对查看遗漏与冲突。','All matches are selected by default. Uncheck separately arranged riders; review omissions and conflicts after planning.')}</p>
  </fieldset>
  <label><span>{text(locale,'司机','Driver')}</span><select name="driverId" defaultValue={initial?.driverId??''}><option value="">{text(locale,'暂不绑定','Assign later')}</option>{drivers.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
  <label><span>{text(locale,'车辆','Vehicle')}</span><select name="vehicleId" defaultValue={initial?.vehicleId??''}><option value="">{text(locale,'暂不绑定','Assign later')}</option>{vehicles.map(v=><option key={v.id} value={v.id}>{v.name} · {v.capacity} {text(locale,'座','seats')}</option>)}</select></label>
  <label className="settings-checkbox full"><input type="checkbox" name="enabled" defaultChecked={initial?.enabled??false}/><span>{text(locale,'启用线路','Enable route')}</span></label>
  <label className="full"><span>{text(locale,'备注','Notes')}</span><textarea name="notes" defaultValue={initial?.notes??''} maxLength={4000}/></label>
 </SettingsForm>;
}
