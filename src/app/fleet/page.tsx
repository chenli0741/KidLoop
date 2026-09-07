import { BusFront, CircleGauge, Clock3, Phone } from "lucide-react";
import { createDriver, createVehicle } from "@/app/actions";
import { ActionForm } from "@/components/action-form";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { formatDate, formatTime, todayInOperationsTimeZone } from "@/lib/date";
import { getDrivers, getShifts, getVehicles } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function FleetPage() {
  const [vehicles, drivers, shifts] = await Promise.all([
    getVehicles(), getDrivers(), getShifts(todayInOperationsTimeZone()),
  ]);

  return (
    <div className="page-container">
      <PageHeader eyebrow="Resources" title="Fleet & drivers" description="Keep vehicles ready and assign each driver to a clear shift." />

      <div className="split-layout">
        <section className="content-section">
          <div className="section-heading"><div><span className="eyebrow">Vehicles</span><h2>{vehicles.length} in fleet</h2></div></div>
          {vehicles.length ? (
            <div className="record-grid">
              {vehicles.map((vehicle) => (
                <article className="record-card" key={vehicle.id}>
                  <div className="record-icon"><BusFront size={21} /></div>
                  <div className="record-main"><strong>{vehicle.name}</strong><span>{vehicle.plate} · {vehicle.capacity} seats</span></div>
                  <StatusBadge status={vehicle.status} />
                </article>
              ))}
            </div>
          ) : <EmptyState title="No vehicles yet" body="Add the first vehicle using the form." />}
        </section>

        <aside className="form-panel">
          <div className="panel-heading"><BusFront size={19} /><div><h2>Add vehicle</h2><p>Vehicle and seat capacity</p></div></div>
          <ActionForm action={createVehicle} submitLabel="Add vehicle">
            <label><span>Vehicle name</span><input name="name" placeholder="Van 01" required /></label>
            <label><span>License plate</span><input name="plate" placeholder="8ABC123" required /></label>
            <label><span>Seat capacity</span><input name="capacity" type="number" min="1" max="100" placeholder="8" required /></label>
          </ActionForm>
        </aside>
      </div>

      <div className="split-layout">
        <section className="content-section">
          <div className="section-heading"><div><span className="eyebrow">Drivers</span><h2>{drivers.length} drivers</h2></div></div>
          {drivers.length ? (
            <div className="record-grid">
              {drivers.map((driver) => (
                <article className="record-card" key={driver.id}>
                  <div className="record-icon teal"><CircleGauge size={21} /></div>
                  <div className="record-main"><strong>{driver.name}</strong><span><Phone size={13} /> {driver.phone}</span></div>
                  <StatusBadge status={driver.status} />
                </article>
              ))}
            </div>
          ) : <EmptyState title="No drivers yet" body="Add a driver to start scheduling shifts." />}
        </section>

        <aside className="form-panel">
          <div className="panel-heading"><CircleGauge size={19} /><div><h2>Add driver</h2><p>Basic contact details</p></div></div>
          <ActionForm action={createDriver} submitLabel="Add driver">
            <label><span>Driver name</span><input name="name" placeholder="Full name" required /></label>
            <label><span>Phone</span><input name="phone" type="tel" placeholder="(555) 123-4567" required /></label>
          </ActionForm>
        </aside>
      </div>

      <section className="content-section">
        <div className="section-heading"><div><span className="eyebrow">Upcoming</span><h2>Driver shifts</h2></div></div>
        {shifts.length ? (
          <div className="table-wrap"><table><thead><tr><th>Date</th><th>Driver</th><th>Vehicle</th><th>Hours</th><th>Status</th></tr></thead>
            <tbody>{shifts.map((shift) => <tr key={shift.id}><td>{formatDate(shift.shiftDate)}</td><td>{shift.driverName}</td><td>{shift.vehicleName} · {shift.vehiclePlate}</td><td><span className="inline-icon"><Clock3 size={14} /> {formatTime(shift.startTime)}–{formatTime(shift.endTime)}</span></td><td><StatusBadge status={shift.status} /></td></tr>)}</tbody>
          </table></div>
        ) : <EmptyState title="No upcoming shifts" body="Create a shift from the Schedule page." />}
      </section>
    </div>
  );
}
