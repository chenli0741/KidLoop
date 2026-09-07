import Image from "next/image";
import { BusFront, Clock3, ExternalLink, MapPin, Navigation, UsersRound } from "lucide-react";
import { formatTime } from "@/lib/date";
import type { Trip } from "@/lib/types";
import { StatusActions } from "@/components/status-actions";
import { StatusBadge } from "@/components/status-badge";
import { text, type Locale } from "@/lib/i18n";

export function TripCard({ trip, locale, interactive = true }: { trip: Trip; locale: Locale; interactive?: boolean }) {
  const completed = trip.riders.filter((rider) => rider.status === "DROPPED_OFF" || rider.status === "ABSENT").length;
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trip.schoolAddress)}`;
  const programMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trip.programAddress)}`;

  return (
    <article className="trip-card">
      <header className="trip-header">
        <div>
          <div className="eyebrow">{formatTime(trip.departureTime, locale)} {text(locale, "出发", "departure")}</div>
          <h3>{trip.schoolName} <span>{text(locale, "至", "to")}</span> {trip.programName}</h3>
        </div>
        <StatusBadge status={trip.status} />
      </header>

      <div className="trip-meta">
        <span><BusFront size={16} /> {trip.vehicleName} · {trip.vehiclePlate}</span>
        <span><UsersRound size={16} /> {trip.driverName} · {trip.driverPhone}</span>
        <span><Clock3 size={16} /> {completed}/{trip.riders.length} {text(locale, "已完成", "complete")}</span>
      </div>

      <div className="trip-progress" role="progressbar" aria-label={text(locale, "行程完成进度", "Trip completion")} aria-valuemin={0} aria-valuemax={trip.riders.length || 1} aria-valuenow={completed}>
        <span style={{ width: `${trip.riders.length ? completed / trip.riders.length * 100 : 0}%` }} />
      </div>

      <div className="route-strip">
        <div className="route-stop">
          <span className="route-dot pickup" />
          <div>
            <small>{text(locale, "接学生 · 放学", "Pickup · dismissal")} {formatTime(trip.dismissalTime, locale)}</small>
            <strong>{trip.schoolAddress}</strong>
            <p>{trip.pickupInstructions}</p>
            <div className="route-links">
              <a href={mapsUrl} target="_blank" rel="noreferrer"><Navigation size={14} /> {text(locale, "导航", "Navigate")}</a>
              {trip.pickupMapUrl ? <a href={trip.pickupMapUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} /> {text(locale, "接送地图", "Pickup map")}</a> : null}
            </div>
          </div>
        </div>
        <div className="route-line" />
        <div className="route-stop">
          <span className="route-dot dropoff" />
          <div>
            <small>{text(locale, "送达", "Dropoff")}</small>
            <strong>{trip.programAddress}</strong>
            <p>{trip.dropoffInfo}{trip.programRequirements ? ` · ${trip.programRequirements}` : ""}</p>
            <a href={programMapsUrl} target="_blank" rel="noreferrer"><MapPin size={14} /> {text(locale, "打开地图", "Open map")}</a>
          </div>
        </div>
      </div>

      <div className="manifest-header">
        <h4>{text(locale, "接送学生清单", "Pickup manifest")}</h4>
        <span>{text(locale, `${trip.riders.length}/${trip.capacity} 个座位`, `${trip.riders.length} of ${trip.capacity} seats`)}</span>
      </div>
      <div className="manifest-list">
        {trip.riders.map((rider) => (
          <div className="rider-row" key={rider.id}>
            <div className="student-photo">
              {rider.photoUrl ? <Image src={rider.photoUrl} alt="" fill sizes="48px" /> : <UsersRound size={28} aria-label={text(locale, "照片待补充", "Photo pending")} />}
            </div>
            <div className="rider-primary">
              <strong>{rider.name}</strong>
              <span>{rider.classroomName} · {text(locale, "年级", "Grade")} {rider.grade || text(locale, "待定", "pending")} · {text(locale, "年龄", "Age")} {rider.age ?? text(locale, "待定", "pending")}</span>
            </div>
            <div className="rider-contact">
              <small>{text(locale, "家长", "Parent")}</small>
              <span>{rider.parentPhone ? <a href={`tel:${rider.parentPhone}`}>{rider.parentName} · {rider.parentPhone}</a> : text(locale, "家长联系方式待补充", "Parent contact pending")}</span>
            </div>
            <StatusBadge status={rider.status} />
            {interactive && !["DRAFT", "CANCELED", "COMPLETED"].includes(trip.status) ? <StatusActions assignmentId={rider.id} status={rider.status} /> : null}
            {(rider.parentNote || rider.parentAbsent) && <div className="rider-parent-note">{rider.parentAbsent && <strong>{text(locale, "家长请假", "Parent absence")} · </strong>}{rider.parentNote}</div>}
          </div>
        ))}
      </div>
    </article>
  );
}
