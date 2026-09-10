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
  const initialGroups = initial?.gradeTimes?.length ? initial.gradeTimes : initial?.pickupTime ? [{grades:[...PICKUP_GRADES],time:initial.pickupTime}] : [{grades:[] as string[],time:''}];
  const [closed,setClosed] = useState(!initial && false || !!initial && !initial.pickupTime && !initial.gradeTimes?.length);
  const [groups,setGroups]=useState(initialGroups);
  return <>
    <input type="hidden" name="exceptionType" value={closed ? "closed" : "grades"}/>
    <label className="record-checkbox full"><input type="checkbox" name="calendarClosed" checked={closed} onChange={e=>setClosed(e.target.checked)} />{text(locale,"当天放假／不接送","No school / no pickup on these dates")}</label>
    {!closed && <>
      <p className="form-hint full">{text(locale,"填写这段日程中各年级的实际放学时间；相同时间的年级可以合并。","Enter the actual dismissal times for this schedule; grades sharing a time can be grouped.")}</p>
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
