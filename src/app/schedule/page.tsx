import { CalendarDays, CircleGauge, Clock3, Route } from "lucide-react";
import { createShift } from "@/app/actions";
import { ActionForm } from "@/components/action-form";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { TripCard } from "@/components/trip-card";
import { TripPlannerForm } from "@/components/trip-planner-form";
import { formatDate, formatTime, todayInOperationsTimeZone } from "@/lib/date";
import { getDrivers, getPrograms, getSchools, getShifts, getStudents, getTrips, getVehicles } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const params = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? "") ? params.date! : todayInOperationsTimeZone();
  const [drivers, vehicles, schools, programs, students, allShifts, trips] = await Promise.all([
    getDrivers(), getVehicles(), getSchools(), getPrograms(), getStudents(), getShifts(date), getTrips(date),
  ]);
  const shifts = allShifts.filter((shift) => shift.shiftDate === date && shift.status !== "CANCELED");
  const readyForTrip = shifts.length > 0 && schools.length > 0 && programs.length > 0 && students.length > 0;

  return (
    <div className="page-container">
      <PageHeader
        eyebrow="Dispatch"
        title="Schedule"
        description="Pair drivers with vehicles, then assign the right students to each route."
        actions={<form className="date-picker" method="get"><CalendarDays size={17} /><input type="date" name="date" defaultValue={date} aria-label="Schedule date" /><button className="button secondary" type="submit">View</button></form>}
      />

      <section className="day-banner"><div><span>{formatDate(date)}</span><strong>{shifts.length} shifts · {trips.length} trips</strong></div><CalendarDays size={22} /></section>

      <div className="planner-grid">
        <aside className="form-panel">
          <div className="panel-heading"><CircleGauge size={19} /><div><h2>Schedule driver</h2><p>Assign a vehicle and work window</p></div></div>
          {drivers.length && vehicles.length ? (
            <ActionForm action={createShift} submitLabel="Schedule shift">
              <input type="hidden" name="shiftDate" value={date} />
              <label className="full"><span>Driver</span><select name="driverId" defaultValue="" required><option value="" disabled>Select driver</option>{drivers.map((driver) => <option value={driver.id} key={driver.id}>{driver.name}</option>)}</select></label>
              <label className="full"><span>Vehicle</span><select name="vehicleId" defaultValue="" required><option value="" disabled>Select vehicle</option>{vehicles.filter((vehicle) => vehicle.status === "AVAILABLE").map((vehicle) => <option value={vehicle.id} key={vehicle.id}>{vehicle.name} · {vehicle.plate} · {vehicle.capacity} seats</option>)}</select></label>
              <label><span>Start time</span><input name="startTime" type="time" required /></label>
              <label><span>End time</span><input name="endTime" type="time" required /></label>
            </ActionForm>
          ) : <p className="setup-callout">Add at least one available driver and vehicle on the Fleet page.</p>}
        </aside>

        <aside className="form-panel wide">
          <div className="panel-heading"><Route size={19} /><div><h2>Build trip</h2><p>Publish a pickup manifest</p></div></div>
          {readyForTrip ? <TripPlannerForm date={date} shifts={shifts} schools={schools} programs={programs} students={students} /> : (
            <p className="setup-callout">A shift, school, program, and eligible student are required to publish a trip.</p>
          )}
        </aside>
      </div>

      <section className="content-section">
        <div className="section-heading"><div><span className="eyebrow">Published routes</span><h2>{formatDate(date)}</h2></div><span className="section-count">{trips.length} trips</span></div>
        {trips.length ? <div className="trip-list">{trips.map((trip) => <TripCard key={trip.id} trip={trip} />)}</div> : (
          <EmptyState title="No trips on this date" body="Schedule a driver and publish the first student route." />
        )}
      </section>

      {shifts.length ? <section className="content-section compact-section"><div className="section-heading"><div><span className="eyebrow">Coverage</span><h2>Available shifts</h2></div></div><div className="shift-chips">{shifts.map((shift) => <span key={shift.id}><Clock3 size={14} /> {formatTime(shift.startTime)}–{formatTime(shift.endTime)} · {shift.driverName} · {shift.vehicleName}</span>)}</div></section> : null}
    </div>
  );
}
