"use client";
import { useState } from "react";
import { text, type Locale } from "@/lib/i18n";
import type { PickupSetting } from "@/lib/pickup-types";
import {PICKUP_GRADES} from '@/lib/pickup-grades';
import {Plus,Trash2} from 'lucide-react';

export function Weekdays({ allowed = [1,2,3,4,5,6,7], selected = [1,2,3,4,5], locale }: { allowed?: number[]; selected?: number[]; locale: Locale }) {
  const labels = locale === "zh" ? ["周一","周二","周三","周四","周五","周六","周日"] : ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  return <fieldset className="pickup-checks full"><legend>{text(locale,"接送星期","Pickup weekdays")}</legend>{allowed.map(d => <label key={d}><input type="checkbox" name="weekdays" value={d} defaultChecked={selected.includes(d)} /><span>{labels[d-1]}</span></label>)}</fieldset>;
}
export function RouteFields({ rules, initial, locale }: { rules: PickupSetting[]; initial?: PickupSetting; locale: Locale }) {
  const [ruleId,setRule] = useState(initial?.ruleId ?? rules[0]?.id ?? "");
  const rule = rules.find(r => r.id===ruleId);
  return <>
    <label className="full"><span>{text(locale,"学校接送规则","School pickup rule")}</span><select name="ruleId" value={ruleId} onChange={e=>setRule(e.target.value)} required><option value="" disabled>{text(locale,"选择规则","Choose a rule")}</option>{rules.map(r=><option key={r.id} value={r.id}>{r.name} · {r.pickupTime}</option>)}</select></label>
    {rule && <p className="form-hint full">{rule.grades?.join("、")} · {text(locale,"时间和日历沿用学校设置。","Time and calendar follow the school settings.")}</p>}
    <Weekdays key={ruleId} allowed={rule?.weekdays ?? []} selected={ruleId===initial?.ruleId ? initial.weekdays : rule?.weekdays} locale={locale} />
  </>;
}
export function ExceptionFields({ initial, locale }: { initial?: PickupSetting; locale: Locale }) {
  const [type,setType] = useState(initial?.gradeTimes?.length ? 'grades' : initial?.pickupTime || !initial ? "time" : "closed");
  const [groups,setGroups]=useState(initial?.gradeTimes?.length?initial.gradeTimes:[{grades:[] as string[],time:''}]);
  return <>
    <label className="full"><span>{text(locale,"日历日程类型","Calendar schedule type")}</span><select name="exceptionType" value={type} onChange={e=>setType(e.target.value)}><option value="time">{text(locale,"提前放学：全校同一时间","Early dismissal: all grades")}</option><option value="grades">{text(locale,"提前放学：按年级设置","Early dismissal: by grade")}</option><option value="closed">{text(locale,"放假／不接送","Holiday / no pickup")}</option></select></label>
    {type==="time" && <label className="full"><span>{text(locale,"日程放学时间","Dismissal time in this schedule")}</span><input type="time" name="pickupTime" defaultValue={initial?.pickupTime ?? ""} required /></label>}
    {type==='grades' && <>
      <input type="hidden" name="gradeTimes" value={JSON.stringify(groups)}/>
      {groups.map((group,index)=><div className="special-time-group full" key={index}>
        <fieldset className="pickup-checks"><legend>{text(locale,`第 ${index+1} 组年级`,`Grade group ${index+1}`)}</legend>{PICKUP_GRADES.map(grade=><label key={grade}><input type="checkbox" checked={group.grades.includes(grade)} disabled={!group.grades.includes(grade)&&groups.some(g=>g.grades.includes(grade))} onChange={e=>setGroups(prev=>prev.map((g,i)=>i===index?{...g,grades:e.target.checked?[...g.grades,grade]:g.grades.filter(v=>v!==grade)}:g))}/><span>{grade}</span></label>)}</fieldset>
        <label><span>{text(locale,'该组放学时间','Dismissal time')}</span><input type="time" required value={group.time} onChange={e=>setGroups(prev=>prev.map((g,i)=>i===index?{...g,time:e.target.value}:g))}/></label>
        <button type="button" className="icon-button danger" disabled={groups.length===1} title={text(locale,'删除时间组','Remove time group')} aria-label={text(locale,'删除时间组','Remove time group')} onClick={()=>setGroups(prev=>prev.filter((_,i)=>i!==index))}><Trash2 size={16}/></button>
      </div>)}
      <button type="button" className="button secondary" disabled={groups.length>=PICKUP_GRADES.length} onClick={()=>setGroups(prev=>[...prev,{grades:[],time:''}])}><Plus size={16}/>{text(locale,'添加时间组','Add time group')}</button>
    </>}
  </>;
}
