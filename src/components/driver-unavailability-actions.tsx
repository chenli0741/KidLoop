import { RecordActions } from "@/components/record-actions";
import { removeDriverUnavailabilityAction, updateDriverUnavailability } from "@/app/fleet/actions";
import { text, type Locale } from "@/lib/i18n";
import type { Driver, DriverUnavailabilityView } from "@/lib/types";

export function DriverUnavailabilityActions({ record, drivers, locale }: { record: DriverUnavailabilityView; drivers: Driver[]; locale: Locale }) {
  const weekdayNames = locale === "zh" ? ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"] : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return <RecordActions
    id={record.id}
    name={`${record.driverName} · ${record.reason}`}
    updatedAt={record.updatedAt}
    update={updateDriverUnavailability}
    remove={removeDriverUnavailabilityAction}
    editTitle={text(locale, "编辑司机不可用时间", "Edit driver unavailability")}
    deleteDescription={text(locale, "删除后，受影响且尚未执行的排班会重新计算。", "Affected unstarted schedules will be recalculated after removal.")}
  >
    <label><span>{text(locale, "司机", "Driver")}</span><select name="driverId" defaultValue={record.driverId} required>{drivers.map(driver => <option key={driver.id} value={driver.id}>{driver.name}</option>)}</select></label>
    <label><span>{text(locale, "开始日期", "Start date")}</span><input name="startsOn" type="date" defaultValue={record.startsOn} required /></label>
    <label><span>{text(locale, "结束日期", "End date")}</span><input name="endsOn" type="date" defaultValue={record.endsOn} required /></label>
    <fieldset className="pickup-checks full"><legend>{text(locale, "生效星期", "Active weekdays")}</legend>{[1,2,3,4,5,6,7].map(day => <label key={day}><input type="checkbox" name="weekdays" value={day} defaultChecked={record.weekdays.includes(day)} /><span>{weekdayNames[day - 1]}</span></label>)}</fieldset>
    <label><span>{text(locale, "不可用开始时间（全天则留空）", "Unavailable from (blank for all day)")}</span><input name="unavailableFrom" type="time" defaultValue={record.unavailableFrom ?? ""} /></label>
    <label><span>{text(locale, "不可用结束时间（全天则留空）", "Unavailable until (blank for all day)")}</span><input name="unavailableTo" type="time" defaultValue={record.unavailableTo ?? ""} /></label>
    <label className="full"><span>{text(locale, "原因", "Reason")}</span><input name="reason" maxLength={200} defaultValue={record.reason} required /></label>
  </RecordActions>;
}

