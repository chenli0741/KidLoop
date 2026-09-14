import { text, type Locale } from "@/lib/i18n";
import type {DriverPreferences} from "@/lib/driver-preferences";
export function DriverConditionFields({locale,schools,...preferences}:DriverPreferences & {locale:Locale;schools:{id:string;name:string}[]}) {
 return <fieldset className="full route-combination-picker" style={{display:"grid",gap:12}}>
  <legend>{text(locale,"司机偏好与条件","Driver preferences and conditions")}</legend>
  <label><span>{text(locale,"最早可接放学时间","Earliest dismissal time")}</span><input name="earliestDismissalTime" type="time" step={60} defaultValue={preferences.earliestDismissalTime??""}/></label>
  <label><span>{text(locale,"最晚可接放学时间","Latest dismissal time")}</span><input name="latestDismissalTime" type="time" step={60} defaultValue={preferences.latestDismissalTime??""}/></label>
  <small>{text(locale,"时间留空表示不限，包含所选时间；按孩子当天实际放学时间判断。","Blank times are unrestricted. Bounds are inclusive and use actual dismissal times.")}</small>
  <label><span>{text(locale,"学校偏好","School preference")}</span><select name="schoolPreferenceMode" defaultValue={preferences.schoolPreferenceMode??"NONE"}>
   <option value="NONE">{text(locale,"不限学校","Any school")}</option>
   <option value="PREFER">{text(locale,"优先接所选学校，可支援其他学校","Prefer selected schools; may cover others")}</option>
   <option value="ONLY">{text(locale,"只接所选学校","Only selected schools")}</option>
  </select></label>
  <fieldset className="route-combination-picker"><legend>{text(locale,"选择学校（可多选）","Select schools")}</legend>
   {schools.map(s=><label key={s.id} className="settings-checkbox"><input type="checkbox" name="preferredSchoolIds" value={s.id} defaultChecked={preferences.preferredSchoolIds?.includes(s.id)??false}/><span>{s.name}</span></label>)}
  </fieldset>
  <small>{text(locale,"优先接：有空可支援其他学校，学校偏好优先于历史熟悉度。只接：多校行程中的接送学校必须全部在所选范围内。选择不限时不使用勾选学校。","Prefer: may cover other schools; explicit preferences outrank history. Only: all pickup schools must be selected. Any school ignores selections.")}</small>
 </fieldset>;
}
