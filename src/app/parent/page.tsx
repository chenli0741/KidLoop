import Image from "next/image";
import Link from "next/link";
import { CalendarDays, Phone, UsersRound, BusFront, MapPin } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getParentChildren, getParentSchedule } from "@/lib/parent-data";
import { getLocale } from "@/lib/i18n-server";
import { text } from "@/lib/i18n";
import { formatDate, formatTime, todayInOperationsTimeZone } from "@/lib/date";
import { completedRideDay, validServiceDate } from "@/lib/day-plans";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { DayPlanForm } from "@/components/day-plan-form";
import { LiveRefresh } from "@/components/live-refresh";

export default async function ParentPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const user = await requireUser(["PARENT"]);
  const locale = await getLocale();
  const today = todayInOperationsTimeZone();
  const params = await searchParams;
  const date = params.date && validServiceDate(params.date) ? params.date : today;
  const [children, schedule] = await Promise.all([getParentChildren(), getParentSchedule(date)]);
  return <div className="page-container parent-page"><LiveRefresh />
    <PageHeader eyebrow={text(locale, `你好，${user.name}`, `Hello, ${user.name}`)} title={text(locale, "我的孩子", "My children")} description={text(locale, "孩子的日程、接送进度和每天的特别安排。", "Your children's schedules, ride status, and daily plans.")} />
    <form className="date-picker family-date" method="get"><CalendarDays size={18} /><input type="date" name="date" defaultValue={date} aria-label={text(locale, "查看日期", "View date")} /><button className="button secondary">{text(locale, "查看", "View")}</button><Link href="/parent" className="button secondary">{text(locale, "今天", "Today")}</Link></form>
    <div className="family-day-title"><h2>{date === today ? text(locale, "今天", "Today") : formatDate(date, locale)}</h2><span>{date}</span></div>
    {children.length === 0 && <EmptyState title={text(locale, "尚未绑定孩子", "No children linked yet")} body={text(locale, "请联系管理员绑定孩子，绑定后即可查看日程和设置请假。", "Ask your administrator to link your children to view schedules and report absences.")} />}
    <div className="family-grid">{children.map((child) => {
      const rides = schedule.rides.filter((ride) => ride.studentId === child.id);
      const plan = schedule.plans.find((p) => p.studentId === child.id);
      const ridesCompleted = completedRideDay(rides);
      return <article className="family-card" key={child.id}>
        <header className="family-child"><div className="family-photo">{child.photoUrl ? <Image unoptimized={child.photoUrl.startsWith("/api/")} src={child.photoUrl} alt={child.name} fill sizes="72px" /> : <UsersRound size={30} />}</div><div><h2>{child.name}</h2><p>{child.schoolName} · {child.classroomName}</p><small>{text(locale, "年级", "Grade")} {child.grade || "—"} · {child.age === null ? text(locale, "年龄待补充", "Age pending") : text(locale, `${child.age} 岁`, `Age ${child.age}`)}</small></div></header>
        <p className="family-destination"><MapPin size={16} />{child.programName}</p>
        {child.notes && <p className="family-note">{child.notes}</p>}
        <section className="family-rides"><h3>{text(locale, "接送状态", "Ride status")}</h3>
          {plan?.absent && <p className="absence-notice">{text(locale, "当天已请假，不需接送", "Absent on this date — no ride needed")}</p>}
          {!rides.length && <p className="form-hint">{text(locale, "当天暂无已发布的接送行程。", "No published ride for this date.")}</p>}
          {rides.map((ride) => <div className="family-ride" key={ride.id}>
            <div className="family-ride-heading"><strong>{formatTime(ride.departure, locale)} {text(locale, "出发", "departure")}</strong><StatusBadge status={ride.status} /></div>
            <p>{ride.schoolName} → {ride.programName}</p>
            <p><BusFront size={16} />{ride.vehicleName} · {ride.vehiclePlate}</p>
            <p>{text(locale, "司机", "Driver")}：{ride.driverName} {ride.driverPhone && <a href={`tel:${ride.driverPhone}`}><Phone size={15} />{ride.driverPhone}</a>}</p>
            <ol className="ride-timeline"><li className={ride.pickedUpAt ? "done" : ""}>{text(locale, "已接到", "Picked up")}<span>{ride.pickedUpAt ? new Date(ride.pickedUpAt).toLocaleTimeString(locale === "zh" ? "zh-CN" : "en-US", { timeZone: "America/Los_Angeles", hour: "2-digit", minute: "2-digit" }) : "—"}</span></li><li className={ride.droppedOffAt ? "done" : ""}>{text(locale, "已送达", "Dropped off")}<span>{ride.droppedOffAt ? new Date(ride.droppedOffAt).toLocaleTimeString(locale === "zh" ? "zh-CN" : "en-US", { timeZone: "America/Los_Angeles", hour: "2-digit", minute: "2-digit" }) : "—"}</span></li></ol>
          </div>)}
        </section>
        {!ridesCompleted && <section className="family-plan"><h3>{text(locale, "请假与特殊要求", "Absence & special requests")}</h3><p className="form-hint">{formatDate(date, locale)}</p>
          {date >= today ? <DayPlanForm key={`${child.id}:${date}`} studentId={child.id} date={date} absent={plan?.absent ?? false} note={plan?.note ?? ""} /> : <p>{plan?.note || text(locale, "当天没有留言。历史安排不可修改。", "No note for this date. Past plans cannot be edited.")}</p>}
        </section>}
      </article>;
    })}</div>
  </div>;
}
