"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarPlus, Sparkles } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { RosterCreateDialog } from "@/components/roster-controls";
import { generateSchedule } from "@/app/schedule/actions";
import { useLocale } from "@/components/locale-provider";
import { text } from "@/lib/i18n";

export function ScheduleActions({ today }: { today: string }) {
  const locale = useLocale();
  const [mode, setMode] = useState("today");
  const options: Array<[string, string]> = [
    ["today", text(locale, "今日", "Today")],
    ["tomorrow", text(locale, "明日", "Tomorrow")],
    ["next-week", text(locale, "下周", "Next week")],
    ["custom", text(locale, "指定日期", "Custom date")],
  ];
  return <div className="schedule-action-groups">
    <div className="schedule-action-group"><span className="eyebrow">{text(locale, "生成排班", "Generate schedule")}</span><RosterCreateDialog title={text(locale, "生成排班", "Generate schedule")} closeLabel={text(locale, "关闭", "Close")}><ActionForm action={generateSchedule} submitLabel={text(locale, "生成", "Generate")}><fieldset className="schedule-generation-options"><legend>{text(locale, "选择范围", "Choose range")}</legend>{options.map(([value, label]) => <label key={value}><input type="radio" name="mode" value={value} checked={mode === value} onChange={() => setMode(value)} />{label}</label>)}</fieldset><label className="custom-date-field"><span>{text(locale, "指定日期", "Custom date")}</span><input name="date" type="date" defaultValue={today} disabled={mode !== "custom"} /></label></ActionForm></RosterCreateDialog></div>
    <div className="schedule-action-group"><span className="eyebrow">{text(locale, "调整排班", "Adjust schedule")}</span><Link className="button secondary" href="/routes/adjust"><Sparkles size={16} />{text(locale, "智能调整接送安排", "Adjust pickup schedules")}</Link></div>
    <Link className="button secondary schedule-review-link" href={`/schedule/review?date=${today}&view=week`}><CalendarPlus size={16} />{text(locale, "每日接送核对", "Daily pickup review")}</Link>
  </div>;
}
