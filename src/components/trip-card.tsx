import Image from "next/image";
import { BusFront, Clock3, ExternalLink, MapPin, Navigation, UsersRound } from "lucide-react";
import { formatTime } from "@/lib/date";
import type { Trip } from "@/lib/types";
import { StatusActions } from "@/components/status-actions";
import { StatusBadge } from "@/components/status-badge";

export function TripCard({ trip, interactive = true }: { trip: Trip; interactive?: boolean }) {
  const completed = trip.riders.filter((rider) => rider.status === "DROPPED_OFF" || rider.status === "ABSENT").length;
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trip.schoolAddress)}`;
  const programMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trip.programAddress)}`;

  return (
    <article className="trip-card">
      <header className="trip-header">
        <div>
          <div className="eyebrow">{formatTime(trip.departureTime)} departure</div>
          <h3>{trip.schoolName} <span>to</span> {trip.programName}</h3>
        </div>
        <StatusBadge status={trip.status} />
      </header>

      <div className="trip-meta">
        <span><BusFront size={16} /> {trip.vehicleName} · {trip.vehiclePlate}</span>
        <span><UsersRound size={16} /> {trip.driverName} · {trip.driverPhone}</span>
        <span><Clock3 size={16} /> {completed}/{trip.riders.length} complete</span>
      </div>

      <div className="route-strip">
        <div className="route-stop">
          <span className="route-dot pickup" />
          <div>
            <small>Pickup · dismissal {formatTime(trip.dismissalTime)}</small>
            <strong>{trip.schoolAddress}</strong>
            <p>{trip.pickupInstructions}</p>
            <div className="route-links">
              <a href={mapsUrl} target="_blank" rel="noreferrer"><Navigation size={14} /> Navigate</a>
              {trip.pickupMapUrl ? <a href={trip.pickupMapUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Pickup map</a> : null}
            </div>
          </div>
        </div>
        <div className="route-line" />
        <div className="route-stop">
          <span className="route-dot dropoff" />
          <div>
            <small>Dropoff</small>
            <strong>{trip.programAddress}</strong>
            <p>{trip.dropoffInfo}{trip.programRequirements ? ` · ${trip.programRequirements}` : ""}</p>
            <a href={programMapsUrl} target="_blank" rel="noreferrer"><MapPin size={14} /> Open map</a>
          </div>
        </div>
      </div>

      <div className="manifest-header">
        <h4>Pickup manifest</h4>
        <span>{trip.riders.length} of {trip.capacity} seats</span>
      </div>
      <div className="manifest-list">
        {trip.riders.map((rider) => (
          <div className="rider-row" key={rider.id}>
            <div className="student-photo">
              <Image src={rider.photoUrl} alt="" fill sizes="48px" />
            </div>
            <div className="rider-primary">
              <strong>{rider.name}</strong>
              <span>{rider.classroomName} · Grade {rider.grade} · Age {rider.age}</span>
            </div>
            <div className="rider-contact">
              <small>Parent</small>
              <span>{rider.parentName} · {rider.parentPhone}</span>
            </div>
            <StatusBadge status={rider.status} />
            {interactive ? <StatusActions assignmentId={rider.id} status={rider.status} /> : null}
          </div>
        ))}
      </div>
    </article>
  );
}
