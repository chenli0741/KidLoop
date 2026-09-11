"use client";

import { useId, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { calendarDays } from "@/lib/pickup-calendar";
import type { PickupSetting } from "@/lib/pickup-types";
import { formatGradeGroup } from "@/lib/pickup-types";
import { text, type Locale } from "@/lib/i18n";

export function PickupCalendar({ today, schoolName, terms, exceptions, rules, studentCounts, locale, archivedThrough = null }: {
  today: string; schoolName: string; terms: PickupSetting[]; exceptions: PickupSetting[]; rules: PickupSetting[]; locale: Locale;
  studentCounts: Record<string, number>;
  archivedThrough?: string | null;
}) {
  const detailDialog = useRef<HTMLDialogElement>(null);
  const detailTitle = useId();
  const [month, setMonth] = useState(today.slice(0,7));
  const [selected, setSelected] = useState(today);
  const [view, setView] = useState<"week" | "month">("week");
  const days = calendarDays(month, terms, exceptions, rules);
  const firstVisible = archivedThrough ? new Date(Date.parse(`${archivedThrough}T12:00:00Z`) + 86400000).toISOString().slice(0,10) : null;
  const labels = {
    holiday: text(locale, "放假，不接送", "Holiday, no pickup"),
    pickup: text(locale, "上学，需要接送", "School day, pickup needed"),
    adjusted: text(locale, "上学，使用日程时间", "School day, scheduled times apply"),
    weekend: text(locale, "周末休息，不接送", "Weekend, no pickup"),
    "outside-term": text(locale, "学期外，不接送", "Outside term, no pickup"),
    unconfigured: text(locale, "学校日历待设置", "School calendar not configured"),
  };
  const offset = (new Date(`${month}-01T12:00:00Z`).getUTCDay() + 6) % 7;
  const day = days.find(d => d.date === selected && (!firstVisible || d.date >= firstVisible)) ?? days.find(d => !firstVisible || d.date >= firstVisible) ?? days[0];
  const countFor = (grades: string[]) => grades.reduce((total, grade) => total + (studentCounts[grade] ?? 0), 0);
  const weekStart = (() => { const date = new Date(`${selected}T12:00:00Z`); const weekday = date.getUTCDay() || 7; date.setUTCDate(date.getUTCDate() - weekday + 1); return date; })();
  const weekDates = Array.from({length: 5}, (_, index) => { const date = new Date(weekStart); date.setUTCDate(date.getUTCDate() + index); return date.toISOString().slice(0,10); });
  const weekDays = weekDates.map(date => calendarDays(date.slice(0,7), terms, exceptions, rules).find(item => item.date === date)).filter((item): item is (typeof days)[number] => !!item && (!firstVisible || item.date >= firstVisible));
  function move(delta: number) {
    if (view === "week") {
      const date = new Date(`${selected}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + delta * 7);
      const next = date.toISOString().slice(0,10); if (firstVisible && next < firstVisible) return;
      setSelected(next); setMonth(next.slice(0,7)); return;
    }
    const date = new Date(`${month}-01T12:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + delta);
    const next = date.toISOString().slice(0,7);
    if (firstVisible && next < firstVisible.slice(0,7)) return;
    setMonth(next); setSelected(`${next}-01`);
  }
  function selectDate(date: string) { setSelected(date); setMonth(date.slice(0,7)); }
  const monthLabel = new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", { year: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${month}-01T12:00:00Z`));
  const weekLabel = weekDates.length ? `${weekDates[0].slice(5).replace("-","/")} — ${weekDates[4].slice(5).replace("-","/")}` : "";
  return <section className="pickup-section school-calendar">
    <div className="calendar-toolbar">
      <button type="button" className="icon-button" disabled={!!firstVisible && (view === "month" ? month <= firstVisible.slice(0,7) : weekDates[4] < firstVisible)} aria-label={text(locale,"上一段","Previous period")} onClick={()=>move(-1)}><ChevronLeft size={18}/></button>
      <h2 aria-live="polite">{view === "week" ? weekLabel : monthLabel}</h2>
      <button type="button" className="icon-button" aria-label={text(locale,"下一段","Next period")} onClick={()=>move(1)}><ChevronRight size={18}/></button>
      <div className="calendar-view-switch" role="group" aria-label={text(locale,"日历视图","Calendar view")}><button type="button" className={view === "week" ? "active" : ""} aria-pressed={view === "week"} onClick={()=>setView("week")}>{text(locale,"周","Week")}</button><button type="button" className={view === "month" ? "active" : ""} aria-pressed={view === "month"} onClick={()=>setView("month")}>{text(locale,"月","Month")}</button></div>
      <button type="button" className="button secondary compact" onClick={()=>{setMonth(today.slice(0,7));setSelected(today);}}>{text(locale,"今天","Today")}</button>
    </div>
    {view === "week" ? <div className="school-week-grid">{weekDays.map(d=><button type="button" key={d.date} className={`school-week-day ${d.status === "holiday" ? "calendar-holiday" : d.status === "adjusted" ? "calendar-special" : d.status === "pickup" ? "calendar-pickup" : ""}`} onClick={()=>{selectDate(d.date);detailDialog.current?.showModal();}}><strong>{new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {weekday:"short", timeZone:"UTC"}).format(new Date(`${d.date}T12:00:00Z`))}</strong><span>{d.date.slice(5).replace("-","/")}</span>{d.schoolTimes.length ? <div className="school-week-times">{d.schoolTimes.map(t=><div key={t.id}><b>{t.time}</b><span>{formatGradeGroup(t.grades)} · {countFor(t.grades)} {text(locale,"人","students")}</span></div>)}</div> : <small>{labels[d.status]}</small>}</button>)}</div> : <div className="school-month-grid">
      {(locale === "zh" ? ["一","二","三","四","五","六","日"] : ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]).map(w=><div className="calendar-weekday" key={w}>{w}</div>)}
      {Array.from({length:offset},(_,i)=><div key={`blank-${i}`} />)}
      {days.map(d=>firstVisible && d.date < firstVisible ? <div key={d.date} aria-hidden="true"/> : <button type="button" key={d.date} aria-haspopup="dialog" aria-pressed={d.date===day.date} aria-current={d.date===today ? "date" : undefined} aria-label={`${d.date} ${labels[d.status]} ${d.exception?.name ?? ""} ${d.schoolTimes.map(t=>t.time).join(", ")}`} className={`calendar-day ${d.status === "holiday" ? "calendar-holiday" : d.status === "adjusted" ? "calendar-special" : d.status === "pickup" ? "calendar-pickup" : ""}`} onClick={()=>{selectDate(d.date);detailDialog.current?.showModal();}}>
        <strong>{d.day}</strong>
        {d.exception ? <span>{d.exception.name}</span> : d.term?.startsOn===d.date ? <span>{text(locale,"开学","Term starts")}</span> : d.term?.endsOn===d.date ? <span>{text(locale,"学期结束","Term ends")}</span> : null}
        {d.schoolTimes.length > 0 && <small className="calendar-day-times">{d.schoolTimes.map(t=>`${t.time}·${countFor(t.grades)}${text(locale,"人"," students")}`).join(" ")}</small>}
        {!d.schoolTimes.length && !d.closed && <small>{d.status === "weekend" ? text(locale,"休息","Off") : d.status === "outside-term" ? text(locale,"学期外","No term") : text(locale,"待设置","Pending")}</small>}
      </button>)}
    </div>}
    <dialog ref={detailDialog} className="record-dialog calendar-detail-dialog" aria-labelledby={detailTitle}>
      <div className="record-dialog-heading"><h2 id={detailTitle}>{day.date}{day.date===today ? ` · ${text(locale,"今天","Today")}` : ""}</h2><button type="button" className="icon-button" aria-label={text(locale,"关闭当天详情","Close day details")} title={text(locale,"关闭当天详情","Close day details")} onClick={()=>detailDialog.current?.close()}><X size={18}/></button></div>
      <div className="calendar-day-detail" aria-live="polite">
      <h3>{schoolName}</h3>
      <p className="calendar-school-status">{labels[day.status]}</p>
      {day.term && <p>{day.term.name} · {day.term.startsOn} — {day.term.endsOn}</p>}
      {day.exception && <p className={day.closed ? "calendar-holiday" : day.status === "adjusted" ? "calendar-special" : ""}>{day.exception.name}{day.status === "adjusted" && (day.exception.gradeTimes?.length ? ` · ${text(locale,'按年级设置放学时间','Dismissal times by grade')}` : ` · ${text(locale,"放学时间","Dismissal time")} ${day.exception.pickupTime}`)}</p>}
      {day.schoolTimes.length>0 && <><h4>{text(locale,"学校放学时间","School dismissal times")}</h4>{day.schoolTimes.map(t=><div className="calendar-pickup-detail" key={t.id}><strong>{t.time}</strong><span>{text(locale,"年级","Grades")} {formatGradeGroup(t.grades)} · {countFor(t.grades)} {text(locale,"名学生","students")}</span></div>)}</>}
    </div>
    </dialog>
    {!terms.length && <p className="form-hint">{text(locale,"尚未设置学期；请在学校规则中添加学期和假期，日历会同步显示。","Add terms and holidays in School rules to populate this calendar.")}</p>}
  </section>;
}
