import { Clock3, Map, MapPin, School } from "lucide-react";
import { createProgram, createSchool } from "@/app/actions";
import { ActionForm } from "@/components/action-form";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { formatTime } from "@/lib/date";
import { getPrograms, getSchools } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function LocationsPage() {
  const [schools, programs] = await Promise.all([getSchools(), getPrograms()]);

  return (
    <div className="page-container">
      <PageHeader eyebrow="Pickup & dropoff" title="Locations" description="Store the exact instructions drivers need at every stop." />
      <div className="split-layout">
        <section className="content-section">
          <div className="section-heading"><div><span className="eyebrow">Pickup</span><h2>Schools</h2></div><span className="section-count">{schools.length}</span></div>
          {schools.length ? <div className="location-list">{schools.map((school) => (
            <article className="location-card" key={school.id}>
              <div className="location-title"><span className="record-icon"><School size={20} /></span><div><h3>{school.name}</h3><p><MapPin size={14} /> {school.address}</p></div></div>
              <div className="location-details"><span><Clock3 size={15} /> Dismissal {formatTime(school.dismissalTime)}</span><p>{school.pickupInstructions}</p><a href={school.pickupMapUrl ?? "#"} target="_blank" rel="noreferrer"><Map size={14} /> Pickup map</a></div>
            </article>
          ))}</div> : <EmptyState title="No schools" body="Add the first pickup location." />}
        </section>
        <aside className="form-panel">
          <div className="panel-heading"><School size={19} /><div><h2>Add school</h2><p>Driver pickup details</p></div></div>
          <ActionForm action={createSchool} submitLabel="Add school">
            <label><span>School name</span><input name="name" required /></label>
            <label><span>Address</span><input name="address" required /></label>
            <label><span>Pickup map URL</span><input name="pickupMapUrl" type="url" placeholder="https://..." required /></label>
            <label><span>Dismissal time</span><input name="dismissalTime" type="time" required /></label>
            <label className="full"><span>Pickup requirements</span><textarea name="pickupInstructions" rows={3} required /></label>
          </ActionForm>
        </aside>
      </div>

      <div className="split-layout">
        <section className="content-section">
          <div className="section-heading"><div><span className="eyebrow">Dropoff</span><h2>After-school programs</h2></div><span className="section-count">{programs.length}</span></div>
          {programs.length ? <div className="location-list">{programs.map((program) => (
            <article className="location-card" key={program.id}>
              <div className="location-title"><span className="record-icon coral"><MapPin size={20} /></span><div><h3>{program.name}</h3><p><MapPin size={14} /> {program.address}</p></div></div>
              <div className="location-details"><strong>Dropoff</strong><p>{program.dropoffInfo}</p><small>{program.requirements}</small></div>
            </article>
          ))}</div> : <EmptyState title="No programs" body="Add the first dropoff location." />}
        </section>
        <aside className="form-panel">
          <div className="panel-heading"><MapPin size={19} /><div><h2>Add program</h2><p>Driver dropoff details</p></div></div>
          <ActionForm action={createProgram} submitLabel="Add program">
            <label><span>Program name</span><input name="name" required /></label>
            <label><span>Address</span><input name="address" required /></label>
            <label className="full"><span>Dropoff information</span><textarea name="dropoffInfo" rows={3} required /></label>
            <label className="full"><span>Program requirements</span><textarea name="requirements" rows={3} required /></label>
          </ActionForm>
        </aside>
      </div>
    </div>
  );
}
