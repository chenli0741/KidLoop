import Link from "next/link";
import { AlertTriangle, BusFront, CalendarPlus, Route, UsersRound } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { TripCard } from "@/components/trip-card";
import { todayInOperationsTimeZone, formatDate } from "@/lib/date";
import { getDashboardCounts, getTrips } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const today = todayInOperationsTimeZone();
  const [counts, trips] = await Promise.all([getDashboardCounts(today), getTrips(today)]);
  const stats = [
    { label: "Active trips", value: counts.activeTrips, icon: Route, tone: "green" },
    { label: "Students", value: counts.students, icon: UsersRound, tone: "blue" },
    { label: "Vehicles", value: counts.vehicles, icon: BusFront, tone: "yellow" },
    { label: "Needs attention", value: counts.attention, icon: AlertTriangle, tone: "red" },
  ];

  return (
    <div className="page-container">
      <PageHeader
        eyebrow={formatDate(today)}
        title="Today’s operations"
        description="Track every vehicle, driver, and student from pickup through dropoff."
        actions={<Link className="button primary" href={`/schedule?date=${today}`}><CalendarPlus size={17} /> Plan today</Link>}
      />

      <section className="stat-grid" aria-label="Today's summary">
        {stats.map(({ label, value, icon: Icon, tone }) => (
          <div className="stat-card" key={label}>
            <span className={`stat-icon ${tone}`}><Icon size={19} /></span>
            <div><strong>{value}</strong><span>{label}</span></div>
          </div>
        ))}
      </section>

      <section className="content-section">
        <div className="section-heading">
          <div><span className="eyebrow">Live manifest</span><h2>Today’s trips</h2></div>
          <span className="section-count">{trips.length} routes</span>
        </div>
        <div className="trip-list">
          {trips.length ? trips.map((trip) => <TripCard key={trip.id} trip={trip} />) : (
            <EmptyState title="No trips scheduled today" body="Create drivers, vehicles, and students, then publish the first route." href="/schedule" action="Open schedule" />
          )}
        </div>
      </section>
    </div>
  );
}
