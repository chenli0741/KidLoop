"use client";
import { useState } from "react";
import { text, type Locale } from "@/lib/i18n";
import type { PickupSetting } from "@/lib/pickup-types";

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
  const [type,setType] = useState(initial?.pickupTime ? "time" : "closed");
  return <>
    <label className="full"><span>{text(locale,"日期安排","Date arrangement")}</span><select name="exceptionType" value={type} onChange={e=>setType(e.target.value)}><option value="closed">{text(locale,"停课／不接送","Closed / no pickup")}</option><option value="time">{text(locale,"全校调整接送时间","School-wide pickup time change")}</option></select></label>
    {type==="time" && <label className="full"><span>{text(locale,"当天接送时间","Pickup time on these dates")}</span><input type="time" name="pickupTime" defaultValue={initial?.pickupTime ?? ""} required /></label>}
  </>;
}
