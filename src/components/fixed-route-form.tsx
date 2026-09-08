"use client";
import { routeName } from "@/lib/route-name";
import { useState } from "react";
import { SettingsForm } from "./settings-form";
import { Weekdays } from "./pickup-fields";
import { saveRoute } from "@/app/schedule/actions";
import type { FixedRoute, RouteStop, RouteStudent } from "@/lib/fixed-route-types";
import type { Driver, Vehicle, School, Program, Student } from "@/lib/types";
import type { PickupSetting } from "@/lib/pickup-types";
import { text, type Locale } from "@/lib/i18n";
export function FixedRouteForm({operatingTermId,termStart,termEnd,initial,schools,programs,drivers,vehicles,students,rules,locale}:{operatingTermId:string;termStart:string;termEnd:string;initial?:FixedRoute;schools:School[];programs:Program[];drivers:Driver[];vehicles:Vehicle[];students:Student[];rules:(PickupSetting&{schoolId:string})[];today:string;locale:Locale}) {
 const [stops,setStops]=useState<RouteStop[]>(initial?.stops??[]);
 const [riders,setRiders]=useState<RouteStudent[]>(initial?.students??[]);
 const change=(id:string,patch:Partial<RouteStop>)=>setStops(prev=>prev.map(s=>s.id===id?{...s,...patch}:s));
 function location(id:string,value:string) {
  const [type,key]=value.split(":"); const place=(type==="school"?schools:programs).find(s=>s.id===key);
  change(id,{schoolId:type==="school"?key:null,programId:type==="program"?key:null,name:place?.name??"",address:place?.address??""});
 }
 function reorder(i:number,d:number){setStops(prev=>{const next=[...prev];[next[i],next[i+d]]=[next[i+d],next[i]];return next;});}
 return <SettingsForm action={saveRoute} submitLabel={text(locale,"保存固定线路","Save recurring route")}>
  <input type="hidden" name="operatingTermId" value={operatingTermId}/><input type="hidden" name="id" value={initial?.id??""}/><input type="hidden" name="updatedAt" value={initial?.updatedAt??""}/><input type="hidden" name="stops" value={JSON.stringify(stops)}/><input type="hidden" name="students" value={JSON.stringify(riders)}/>
  <label className="full"><span>{text(locale,"线路名称","Route name")}</span><input name="name" value={routeName(stops)} readOnly placeholder={text(locale,"选择站点后自动生成","Generated from stops")}/><small className="form-hint">{text(locale,"根据站点顺序自动生成","Generated from stop order")}</small></label>
  <label><span>{text(locale,"开始日期","Start date")}</span><input type="date" name="startsOn" defaultValue={initial?.startsOn??termStart} required/></label>
  <label><span>{text(locale,"结束日期","End date")}</span><input type="date" name="endsOn" defaultValue={initial?.endsOn??termEnd} required/></label>
  <Weekdays selected={initial?.weekdays} locale={locale}/>
  <div className="full fixed-stop-list"><h3>{text(locale,"按顺序设置站点","Stops in travel order")}</h3>
  {stops.map((s,i)=><div className="fixed-stop-editor" key={s.id}>
   <div className="fixed-stop-heading"><strong>{text(locale,`第 ${i+1} 站`,`Stop ${i+1}`)}</strong><button type="button" className="button secondary compact" disabled={i===0} onClick={()=>reorder(i,-1)} aria-label={text(locale,`第 ${i+1} 站上移`,`Move stop ${i+1} up`)}>↑</button><button type="button" className="button secondary compact" disabled={i===stops.length-1} onClick={()=>reorder(i,1)} aria-label={text(locale,`第 ${i+1} 站下移`,`Move stop ${i+1} down`)}>↓</button><button type="button" className="button secondary compact" onClick={()=>{setStops(stops.filter(x=>x.id!==s.id));setRiders(riders.filter(a=>a.pickupStopId!==s.id&&a.dropoffStopId!==s.id));}}>{text(locale,"移除","Remove")}</button></div>
   <label><span>{text(locale,"地点","Location")}</span><select value={s.schoolId?`school:${s.schoolId}`:s.programId?`program:${s.programId}`:"custom"} onChange={e=>location(s.id,e.target.value)}><option value="custom">{text(locale,"其他地点（自行填写）","Other location")}</option><optgroup label={text(locale,"学校","Schools")}>{schools.map(p=><option value={`school:${p.id}`} key={p.id}>{p.name}</option>)}</optgroup><optgroup label={text(locale,"课外班","After-school programs")}>{programs.map(p=><option value={`program:${p.id}`} key={p.id}>{p.name}</option>)}</optgroup></select></label>
   {!s.schoolId&&!s.programId&&<label><span>{text(locale,"地点名称","Location name")}</span><input value={s.name} onChange={e=>change(s.id,{name:e.target.value})} required maxLength={160}/></label>}
   <label><span>{text(locale,"地址","Address")}</span><input value={s.address} readOnly={!!(s.schoolId||s.programId)} onChange={e=>change(s.id,{address:e.target.value})} required maxLength={500}/></label>
   <label><span>{text(locale,"预计到达时间","Planned arrival time")}</span><input type="time" value={s.time} onChange={e=>change(s.id,{time:e.target.value})} required/></label>
   {s.schoolId&&<div className="form-hint">{text(locale,"学校接送时间（点击带入）","School pickup times (tap to use)")}{rules.filter(r=>r.schoolId===s.schoolId).map(r=><button type="button" className="button secondary compact" key={r.id} onClick={()=>change(s.id,{time:r.pickupTime??""})}>{r.grades?.join("、")} · {r.pickupTime} · {r.weekdays?.map(d=>(locale==="zh"?["一","二","三","四","五","六","日"]:["Mon","Tue","Wed","Thu","Fri","Sat","Sun"])[d-1]).join("/")}</button>)}</div>}
  </div>)}
  <button type="button" className="button secondary" onClick={()=>setStops([...stops,{id:crypto.randomUUID(),name:"",address:"",schoolId:null,programId:null,time:""}])}>{text(locale,"＋ 添加站点","+ Add stop")}</button></div>
  <fieldset className="full fixed-riders"><legend>{text(locale,"固定接送学生","Recurring riders")}</legend><p className="form-hint">{text(locale,"添加学校站点后，选择学生及后续下车地点。","Add school stops, then select riders and their dropoff stops.")}</p>
   {students.filter(st=>stops.some(s=>s.schoolId===st.schoolId)||riders.some(a=>a.studentId===st.id)).map(st=>{const a=riders.find(a=>a.studentId===st.id);const from=stops.findIndex(s=>s.id===a?.pickupStopId);return <div className="fixed-rider" key={st.id}><label className="settings-checkbox"><input type="checkbox" checked={!!a} onChange={e=>{if(!e.target.checked)setRiders(riders.filter(x=>x.studentId!==st.id));else {const index=stops.findIndex(s=>s.schoolId===st.schoolId);setRiders([...riders,{studentId:st.id,pickupStopId:stops[index]?.id??"",dropoffStopId:stops.slice(index+1).find(s=>s.programId===st.programId)?.id??""}]);}}}/><span>{st.name} · {st.grade} · {st.schoolName}</span></label>{a&&<><label><span>{text(locale,"上车站","Pickup stop")}</span><select required value={a.pickupStopId} onChange={e=>setRiders(riders.map(x=>x.studentId===st.id?{...x,pickupStopId:e.target.value,dropoffStopId:""}:x))}>{stops.filter(s=>s.schoolId===st.schoolId).map(s=><option key={s.id} value={s.id}>{s.name} · {s.time}</option>)}</select></label><label><span>{text(locale,"下车站","Dropoff stop")}</span><select required value={a.dropoffStopId} onChange={e=>setRiders(riders.map(x=>x.studentId===st.id?{...x,dropoffStopId:e.target.value}:x))}><option value="">{text(locale,"选择后续站点","Choose a later stop")}</option>{stops.slice(from+1).map(s=><option key={s.id} value={s.id}>{s.name} · {s.time}</option>)}</select></label></>}</div>;})}
  </fieldset>
  <label><span>{text(locale,"固定司机","Regular driver")}</span><select name="driverId" defaultValue={initial?.driverId??""}><option value="">{text(locale,"暂不绑定","Assign later")}</option>{drivers.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
  <label><span>{text(locale,"固定车辆","Regular vehicle")}</span><select name="vehicleId" defaultValue={initial?.vehicleId??""}><option value="">{text(locale,"暂不绑定","Assign later")}</option>{vehicles.map(v=><option key={v.id} value={v.id}>{v.name} · {v.capacity} {text(locale,"座","seats")}</option>)}</select></label>
  <label className="settings-checkbox full"><input type="checkbox" name="enabled" defaultChecked={initial?.enabled??false}/><span>{text(locale,"启用：按学校日历自动安排每日任务","Enable automatic daily tasks using school calendars")}</span></label>
  <p className="form-hint full">{text(locale,"修改司机会用于尚未开始的任务和后续日期；已执行任务保留原记录。","Driver changes apply to unstarted and future tasks. Started trips keep their records.")}</p>
 </SettingsForm>;
}
