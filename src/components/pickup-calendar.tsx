"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { calendarDays } from "@/lib/pickup-calendar";
import type { PickupSetting } from "@/lib/pickup-types";
import { text, type Locale } from "@/lib/i18n";

export function PickupCalendar({ today, terms, exceptions, rules, routes, locale }: {
  today: string; terms: PickupSetting[]; exceptions: PickupSetting[]; rules: PickupSetting[]; routes: PickupSetting[]; locale: Locale;
}) {
  const [month, setMonth] = useState(today.slice(0,7));
  const [selected, setSelected] = useState(today);
  const days = calendarDays(month, terms, exceptions, rules, routes);
  const offset = (new Date(`${month}-01T12:00:00Z`).getUTCDay() + 6) % 7;
  const day = days.find(d => d.date === selected) ?? days[0];
  function move(delta: number) {
    const date = new Date(`${month}-01T12:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + delta);
    const next = date.toISOString().slice(0,7);
    setMonth(next); setSelected(`${next}-01`);
  }
  const monthLabel = new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", { year: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${month}-01T12:00:00Z`));
  return <section className="pickup-section school-calendar">
    <div className="calendar-toolbar">
      <button type="button" className="icon-button" aria-label={text(locale,"上个月","Previous month")} onClick={()=>move(-1)}><ChevronLeft size={18}/></button>
      <h2 aria-live="polite">{monthLabel}</h2>
      <button type="button" className="icon-button" aria-label={text(locale,"下个月","Next month")} onClick={()=>move(1)}><ChevronRight size={18}/></button>
      <button type="button" className="button secondary compact" onClick={()=>{setMonth(today.slice(0,7));setSelected(today);}}>{text(locale,"今天","Today")}</button>
    </div>
    <div className="calendar-legend"><span className="calendar-holiday">{text(locale,"放假","Holiday")}</span><span className="calendar-special">{text(locale,"时间调整","Time change")}</span><span className="calendar-pickup">{text(locale,"有接送","Pickup")}</span></div>
    <div className="school-month-grid">
      {(locale === "zh" ? ["一","二","三","四","五","六","日"] : ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]).map(w=><div className="calendar-weekday" key={w}>{w}</div>)}
      {Array.from({length:offset},(_,i)=><div key={`blank-${i}`} />)}
      {days.map(d=><button type="button" key={d.date} aria-pressed={d.date===day.date} aria-current={d.date===today ? "date" : undefined} aria-label={`${d.date} ${d.exception?.name ?? ""} ${d.pickups.length ? text(locale,`${d.pickups.length} 条接送`,`${d.pickups.length} pickups`) : ""}`} className={`calendar-day ${d.closed ? "calendar-holiday" : d.exception ? "calendar-special" : d.pickups.length ? "calendar-pickup" : ""}`} onClick={()=>setSelected(d.date)}>
        <strong>{d.day}</strong>
        {d.exception ? <span>{d.exception.name}</span> : d.term?.startsOn===d.date ? <span>{text(locale,"开学","Term starts")}</span> : d.term?.endsOn===d.date ? <span>{text(locale,"学期结束","Term ends")}</span> : null}
        {d.pickups.length > 0 && <small>{d.pickups[0].time}{d.pickups.length>1 ? ` +${d.pickups.length-1}` : ""}</small>}
      </button>)}
    </div>
    <div className="calendar-day-detail" aria-live="polite">
      <h3>{day.date}{day.date===today ? ` · ${text(locale,"今天","Today")}` : ""}</h3>
      {day.term && <p>{day.term.name} · {day.term.startsOn} — {day.term.endsOn}</p>}
      {day.exception && <p className={day.closed ? "calendar-holiday" : "calendar-special"}>{day.exception.name} · {day.closed ? text(locale,"放假，不接送","Closed, no pickup") : `${text(locale,"接送时间调整为","Pickup time changed to")} ${day.exception.pickupTime}`}</p>}
      {day.pickups.map(p=><div className="calendar-pickup-detail" key={p.id}><strong>{p.time} · {p.name}</strong><span>{text(locale,"年级","Grades")} {p.grades.join("、")} · {p.destination}</span></div>)}
      {!day.closed && !day.pickups.length && <p>{!day.term ? text(locale,"当天不在已设置的学期内。","Outside configured school terms.") : text(locale,"当天没有接送安排。","No pickups scheduled for this day.")}</p>}
    </div>
    {!terms.length && <p className="form-hint">{text(locale,"尚未设置学期；请在学校规则中添加学期和假期，日历会同步显示。","Add terms and holidays in School rules to populate this calendar.")}</p>}
    <p className="form-hint">{text(locale,"日历显示固定线路安排；启用线路后，每日接送任务自动生成。","Enabled recurring routes automatically generate daily pickup tasks.")}</p>
  </section>;
}
