import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getTrips } from "@/lib/data";
import { validServiceDate } from "@/lib/day-plans";
import { todayInOperationsTimeZone, formatDate } from "@/lib/date";
import { getLocale } from "@/lib/i18n-server";
import { text } from "@/lib/i18n";
import { DriverDatePicker } from "@/components/driver-date-picker";
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
  return <div className="page-container"><LiveRefresh />
    {params.week && validServiceDate(params.week) && <Link className="driver-week-return" href={`/driver/week?week=${params.week}&day=${date}&view=${params.view === 'month' ? 'month' : 'week'}`}>{text(locale, "← 返回日程", "← Back to schedule")}</Link>}
    <section className="day-banner"><div><span>{formatDate(date, locale)}</span><strong>{trips.length} {text(locale, "个行程", trips.length === 1 ? "ride" : "rides")}</strong></div><DriverDatePicker date={date} locale={locale} week={params.week && validServiceDate(params.week) ? params.week : undefined} view={params.view}/></section>
    <ParentRequests date={date} locale={locale} />
    <section className="content-section trip-list">{trips.length ? trips.map((trip) => <TripCard role="DRIVER" showParentContact={false} cameraEnabled key={trip.id} trip={trip} locale={locale} />) : <EmptyState title={text(locale, "当天暂无任务", "No rides assigned")} body={text(locale, "管理员为你安排的行程会显示在这里。", "Rides assigned by your administrator will appear here.")} />}</section>
  </div>;
}
