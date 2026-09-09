import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getTrips } from "@/lib/data";
import { validServiceDate } from "@/lib/day-plans";
import { todayInOperationsTimeZone, formatDate } from "@/lib/date";
import { getLocale } from "@/lib/i18n-server";
import { text } from "@/lib/i18n";
import { PageHeader } from "@/components/page-header";
import { TripCard } from "@/components/trip-card";
import { EmptyState } from "@/components/empty-state";
import { ParentRequests } from "@/components/parent-requests";
import { LiveRefresh } from "@/components/live-refresh";

export default async function DriverPage({ searchParams }: { searchParams: Promise<{ date?: string; week?: string; view?: string }> }) {
  await requireUser(["DRIVER"]);
  const locale = await getLocale();
  const params = await searchParams;
  const date = params.date && validServiceDate(params.date) ? params.date : todayInOperationsTimeZone();
  const trips = await getTrips(date);
  return <div className="page-container"><LiveRefresh /><PageHeader title={text(locale, "我的行程", "My trips")} description={text(locale, "查看负责的路线、学生名单和家长留言。", "Your assigned routes, riders, and parent notes.")} actions={<form className="date-picker"><CalendarDays size={18} /><input type="date" name="date" defaultValue={date} aria-label={text(locale, "行程日期", "Trip date")} /><button className="button secondary">{text(locale, "查看", "View")}</button></form>} />
    {params.week && validServiceDate(params.week) && <Link className="driver-week-return" href={`/driver/week?week=${params.week}&day=${date}&view=${params.view === 'month' ? 'month' : 'week'}`}>{text(locale, "← 返回日程", "← Back to schedule")}</Link>}
    <section className="day-banner"><div><span>{formatDate(date, locale)}</span><strong>{trips.length} {text(locale, "个行程", "trips")}</strong></div><CalendarDays size={24} /></section>
    <ParentRequests date={date} locale={locale} />
    <section className="content-section trip-list">{trips.length ? trips.map((trip) => <TripCard showParentContact={false} cameraEnabled key={trip.id} trip={trip} locale={locale} />) : <EmptyState title={text(locale, "当天暂无任务", "No trips assigned")} body={text(locale, "管理员为你安排的行程会显示在这里。", "Trips assigned by your administrator will appear here.")} />}</section>
  </div>;
}
