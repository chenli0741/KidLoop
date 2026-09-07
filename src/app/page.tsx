import { ParentRequests } from "@/components/parent-requests";
import { requireUser } from "@/lib/auth";
import Link from "next/link";
import { AlertTriangle, BusFront, CalendarPlus, Route, UsersRound } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { TripCard } from "@/components/trip-card";
import { todayInOperationsTimeZone, formatDate } from "@/lib/date";
import { getDashboardCounts, getTrips } from "@/lib/data";
import { text } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  await requireUser(["ADMIN"]);
  const locale = await getLocale();
  const today = todayInOperationsTimeZone();
  const [counts, trips] = await Promise.all([getDashboardCounts(today), getTrips(today)]);
  const stats = [
    { label: text(locale, "进行中行程", "Active trips"), value: counts.activeTrips, icon: Route, tone: "green" },
    { label: text(locale, "学生", "Students"), value: counts.students, icon: UsersRound, tone: "blue" },
    { label: text(locale, "车辆", "Vehicles"), value: counts.vehicles, icon: BusFront, tone: "yellow" },
    { label: text(locale, "需要处理", "Needs attention"), value: counts.attention, icon: AlertTriangle, tone: "red" },
  ];

  return (
    <div className="page-container">
      <PageHeader
        eyebrow={formatDate(today, locale)}
        title={text(locale, "今日运营", "Today’s operations")}
        description={text(locale, "跟踪每辆车、每位司机和每名学生从接到到送达的全过程。", "Track every vehicle, driver, and student from pickup through dropoff.")}
        actions={<Link className="button primary" href={`/schedule?date=${today}`}><CalendarPlus size={17} /> {text(locale, "安排今日行程", "Plan today")}</Link>}
      />

      <section className="stat-grid" aria-label={text(locale, "今日概览", "Today's summary")}>
        {stats.map(({ label, value, icon: Icon, tone }) => (
          <div className="stat-card" key={label}>
            <span className={`stat-icon ${tone}`}><Icon size={19} /></span>
            <div><strong>{value}</strong><span>{label}</span></div>
          </div>
        ))}
      </section>

      <ParentRequests date={today} locale={locale} />
      <section className="content-section">
        <div className="section-heading">
          <div><span className="eyebrow">{text(locale, "实时清单", "Live manifest")}</span><h2>{text(locale, "今日行程", "Today’s trips")}</h2></div>
          <span className="section-count">{trips.length} {text(locale, "条路线", "routes")}</span>
        </div>
        <div className="trip-list">
          {trips.length ? trips.map((trip) => <TripCard key={trip.id} trip={trip} locale={locale} />) : (
            <EmptyState title={text(locale, "今天暂无行程", "No trips scheduled today")} body={text(locale, "创建司机、车辆和学生后，即可发布第一条路线。", "Create drivers, vehicles, and students, then publish the first route.")} href="/schedule/dispatch" action={text(locale, "当天调度", "Daily dispatch")} />
          )}
        </div>
      </section>
    </div>
  );
}
