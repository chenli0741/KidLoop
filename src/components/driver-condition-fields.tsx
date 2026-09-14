import { text, type Locale } from "@/lib/i18n";

export function DriverConditionFields({ locale, earliestDismissalTime }: { locale: Locale; earliestDismissalTime?: string | null }) {
  return <label>
    <span>{text(locale, "最早可接放学时间", "Earliest dismissal time")}</span>
    <input name="earliestDismissalTime" type="time" step={60} defaultValue={earliestDismissalTime ?? ""} />
    <small>{text(locale, "留空表示不限。按学校当天实际放学时间判断，包含所选时间；更早放学需另安排司机。", "Leave blank for no restriction. Uses actual school dismissal, including the selected time; earlier dismissals need another driver.")}</small>
  </label>;
}
