import { SettingsForm } from "@/components/settings-form";
import { saveSetting } from "@/app/schedule/actions";
import { ExceptionFields, RouteFields, Weekdays } from "@/components/pickup-fields";
import type { PickupSetting, SettingKind } from "@/lib/pickup-types";
import { text, type Locale } from "@/lib/i18n";

export function PickupSettingForm({ kind, schoolId, locale, initial, rules=[], grades=[], programs=[], remove=false }: {
  kind: SettingKind; schoolId: string; locale: Locale; initial?: PickupSetting; rules?: PickupSetting[];
  grades?: string[]; programs?: {id:string;name:string}[]; remove?: boolean;
}) {
  return <SettingsForm action={saveSetting} submitLabel={remove ? text(locale,"确认删除","Confirm removal") : text(locale,"保存设置","Save settings")}>
    <input type="hidden" name="schoolId" value={schoolId} /><input type="hidden" name="kind" value={kind} />
    <input type="hidden" name="id" value={initial?.id ?? ""} /><input type="hidden" name="updatedAt" value={initial?.updatedAt ?? ""} />
    {remove ? <><input type="hidden" name="remove" value="1" /><p className="full">{text(locale,`删除“${initial?.name}”？对应规则的日程预览会重新计算。`,`Remove “${initial?.name}”? The schedule preview will be recalculated.`)}</p></> : <>
      <label className="full"><span>{text(locale,"名称","Name")}</span><input name="name" defaultValue={initial?.name} maxLength={160} required /></label>
      {(kind==="term" || kind==="exception") && <>
        <label><span>{text(locale,"开始日期","Start date")}</span><input type="date" name="startsOn" defaultValue={initial?.startsOn} required /></label>
        <label><span>{text(locale,"结束日期","End date")}</span><input type="date" name="endsOn" defaultValue={initial?.endsOn} required /></label>
        {kind==="exception" && <ExceptionFields initial={initial} locale={locale} />}
      </>}
      {kind==="rule" && <>
        <fieldset className="pickup-checks full"><legend>{text(locale,"适用年级（可多选）","Grades (select one or more)")}</legend>{grades.map(grade=><label key={grade}><input type="checkbox" name="grades" value={grade} defaultChecked={initial?.grades?.includes(grade)} /><span>{text(locale, `${grade} 年级`, `Grade ${grade}`)}</span></label>)}</fieldset>
        <Weekdays selected={initial?.weekdays} locale={locale} />
        <label className="full"><span>{text(locale,"到校接送时间","School pickup time")}</span><input type="time" name="pickupTime" defaultValue={initial?.pickupTime ?? ""} required /></label>
      </>}
      {kind==="route" && <>
        <RouteFields rules={rules} initial={initial} locale={locale} />
        <label className="full"><span>{text(locale,"课外班目的地","After-school destination")}</span><select name="programId" defaultValue={initial?.programId ?? ""} required><option value="" disabled>{text(locale,"选择目的地","Choose destination")}</option>{programs.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      </>}
    </>}
  </SettingsForm>;
}
