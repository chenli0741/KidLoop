"use client";

import { useEffect, useRef, useState } from "react";
import {PickupCamera} from './pickup-camera';
import {StudentPhotoPreview} from './student-photo-preview';
import { BusFront, Clock3, UsersRound } from "lucide-react";
import { LocationMap } from "@/components/location-map";
import { formatTime } from "@/lib/date";
import type { Trip } from "@/lib/types";
import { StatusActions } from "@/components/status-actions";
import { StatusBadge } from "@/components/status-badge";
import { text, type Locale } from "@/lib/i18n";
import { applyTripExecution, type TripExecution } from "@/lib/trip-execution";
import { TripJourneyControls } from "@/components/trip-journey-controls";

export function TripCard({ trip: source, locale, interactive = true, cameraEnabled = false, showParentContact = true, role = "ADMIN" }: { trip: Trip; locale: Locale; cameraEnabled?: boolean; showParentContact?: boolean; interactive?: boolean; role?: "ADMIN" | "DRIVER" }) {
  const [state, setState] = useState({ source, trip: source });
  let trip = state.trip;
  if (state.source !== source) {
    trip = (source.executionVersion ?? '') >= (state.trip.executionVersion ?? '') ? source : state.trip;
    setState({ source, trip });
  }
  const refreshEpoch = useRef(0);
  const [selectedStopIndex, setSelectedStopIndex] = useState<number | null>(null);
  const [syncFailed,setSyncFailed]=useState(false);
  useEffect(()=>{
    if(!source.hasSharedPickups)return;
    let stopped=false;
    let busy=false;
    async function refresh(){
      if(busy||document.visibilityState!=="visible")return;
      busy=true; const epoch=refreshEpoch.current;
      try{const res=await fetch(`/api/shared-pickups?trip=${source.id}`,{cache:"no-store",signal:AbortSignal.timeout(10000)});
        if(!res.ok)throw new Error("Sync failed");
        if(!stopped)setSyncFailed(false);
        if(res.ok){const riders:Trip["riders"]=await res.json();if(!stopped&&epoch===refreshEpoch.current)setState(prev=>({...prev,trip:{...prev.trip,riders:[...prev.trip.riders.filter(r=>!r.shared),...riders]}}));}
      }catch{if(!stopped)setSyncFailed(true);}finally{busy=false;}
    }
    const timer=setInterval(()=>{void refresh().catch(()=>{});},2000);
    return ()=>{stopped=true;clearInterval(timer);};
  },[source.id,source.hasSharedPickups]);
  function onUpdated(update: TripExecution) {
    refreshEpoch.current++;
    setSelectedStopIndex(update.currentStopIndex ?? null);
    setState(previous => ({ ...previous, trip: applyTripExecution(previous.trip, update) }));
  }
  const countedRiders = trip.riders.filter((rider) => !rider.otherVehicle && !['ABSENT','EXCEPTION'].includes(rider.status));
  const completed = countedRiders.filter((rider) => rider.status === 'DROPPED_OFF').length;

  return (
    <article className="trip-card">
      {syncFailed&&<p role="alert">{text(locale,"名单同步中断，正在重试。请联网后核对再操作。","Manifest sync interrupted. Retrying; reconnect and verify before updating.")}</p>}
      <header className="trip-header">
        <div>
          <div className="eyebrow">{formatTime(trip.departureTime, locale)} {text(locale, "出发", "departure")}</div>
        <h3>{trip.routeName ?? <>{trip.schoolName} <span>{text(locale, "至", "to")}</span> {trip.programName}</>}</h3>
        </div>
        <StatusBadge status={trip.status} />
      </header>

      <div className="trip-meta">
        <span><BusFront size={16} /> {trip.vehicleName} · {trip.vehiclePlate}</span>
        <span><UsersRound size={16} /> {trip.driverName} · {trip.driverPhone}</span>
        <span><Clock3 size={16} /> {completed}/{countedRiders.length} {text(locale, "已完成", "complete")}</span>
      </div>

      <div className="trip-progress" role="progressbar" aria-label={text(locale, "行程完成进度", "Trip completion")} aria-valuemin={0} aria-valuemax={countedRiders.length || 1} aria-valuenow={completed}>
        <span style={{ width: `${countedRiders.length ? completed / countedRiders.length * 100 : 0}%` }} />
      </div>

      <section className="trip-segment">
        <TripSegmentContent role={role} selectedStopIndex={selectedStopIndex ?? trip.currentStopIndex ?? 0} onSelectStop={setSelectedStopIndex} showParentContact={showParentContact} cameraEnabled={cameraEnabled} trip={trip} journeyTrip={trip} locale={locale} interactive={interactive} onUpdated={onUpdated}/>
      </section>
    </article>
  );
}

function TripSegmentContent({trip,journeyTrip,locale,interactive,onUpdated,showStops=true,cameraEnabled=false,showParentContact=true,role,selectedStopIndex,onSelectStop}:{trip:Trip;journeyTrip?:Trip;locale:Locale;interactive:boolean;onUpdated:(update:TripExecution)=>void;showStops?:boolean;cameraEnabled?:boolean;showParentContact?:boolean;role:"ADMIN"|"DRIVER";selectedStopIndex?:number;onSelectStop?:(index:number)=>void}) {
  const currentIndex = trip.currentStopIndex ?? 0;
  const currentStop = trip.routeStops?.[selectedStopIndex ?? currentIndex];
  const visibleRiders = (currentStop ? trip.riders.filter(rider => currentStop.schoolId ? rider.pickupStopId === currentStop.id : rider.dropoffStopId === currentStop.id) : trip.riders)
    .filter(rider => role !== "DRIVER" || (!rider.parentAbsent && rider.status !== "ABSENT"));
  const countedRiders = visibleRiders.filter((rider) => !rider.otherVehicle && !['ABSENT','EXCEPTION'].includes(rider.status));
  return <>

      {showStops && (trip.routeStops?.length ? <ol className="fixed-trip-stops">{trip.routeStops.map((stop,i)=><li className={`${i < currentIndex ? "is-passed " : i === currentIndex ? "is-current " : "is-upcoming "}${i === (selectedStopIndex ?? currentIndex) ? "is-selected" : ""}`} aria-current={i === currentIndex ? "step" : undefined} key={stop.id}><div className="fixed-stop-select"><button type="button" className="fixed-stop-main" disabled={!onSelectStop} onClick={() => onSelectStop?.(i)}><span className="fixed-stop-marker"><span className="fixed-stop-number">{i+1}</span>{i === currentIndex && <BusFront className="fixed-stop-current-icon" size={15} aria-label={text(locale, "当前行程位置", "Current trip position")} />}</span><span className="fixed-stop-copy"><span className="fixed-stop-title"><small>{stop.time}</small><strong>{stop.name}</strong>{i === currentIndex && <em className="fixed-stop-current">{text(locale, "当前", "Current")}</em>}</span><span className="fixed-stop-address">{stop.address}</span></span></button><LocationMap compact name={stop.name} address={stop.address}/></div></li>)}</ol> : <div className="route-strip">
        <div className="route-stop">
          <span className="route-dot pickup" />
          <div>
            <small>{text(locale, "接学生 · 放学", "Pickup · dismissal")} {formatTime(trip.dismissalTime, locale)}</small>
            <strong>{trip.schoolAddress}</strong>
            <div className="route-links">
              <LocationMap name={trip.schoolName} address={trip.schoolAddress} />
              {trip.pickupMapUrl && <LocationMap name={trip.schoolName} url={trip.pickupMapUrl} />}
            </div>
            {trip.pickupInstructions?.trim() && <details className="route-notes">
              <summary>{text(locale, "接送说明", "Pickup details")}</summary>
              <p>{trip.pickupInstructions}</p>
            </details>}
          </div>
        </div>
        <div className="route-line" />
        <div className="route-stop">
          <span className="route-dot dropoff" />
          <div>
            <small>{text(locale, "送达", "Dropoff")}</small>
            <strong>{trip.programAddress}</strong>
            <LocationMap name={trip.programName} address={trip.programAddress} />
            {(trip.dropoffInfo?.trim() || trip.programRequirements?.trim()) && <details className="route-notes">
              <summary>{text(locale, "送达说明", "Dropoff details")}{trip.programRequirements?.trim() && <span className="route-requirements-flag">{text(locale, "有特殊要求", "Special requirements")}</span>}</summary>
              {trip.dropoffInfo?.trim() && <p>{trip.dropoffInfo}</p>}
              {trip.programRequirements?.trim() && <p><b>{text(locale, "特殊要求：", "Special requirements: ")}</b>{trip.programRequirements}</p>}
            </details>}
          </div>
        </div>
      </div>)}

      {journeyTrip && cameraEnabled && <TripJourneyControls trip={journeyTrip} locale={locale} onUpdated={onUpdated} />}
      {cameraEnabled && interactive && selectedStopIndex === currentIndex && currentStop?.schoolId && !["DRAFT","CANCELED","COMPLETED"].includes(trip.status) && <PickupCamera trip={{...trip, riders: visibleRiders}} locale={locale} onUpdated={onUpdated}/>}
      <div className="manifest-header">
        <h4>{text(locale, "接送学生清单", "Pickup manifest")}</h4>
        <span>{trip.hasSharedPickups ? text(locale,`共享接送：本车应接 ${trip.sharedPickupMin ?? 0}–${trip.sharedPickupMax ?? trip.capacity} 人 · ${trip.capacity} 座`,`Shared pickup: this vehicle should take ${trip.sharedPickupMin ?? 0}–${trip.sharedPickupMax ?? trip.capacity} riders · ${trip.capacity} seats`) : trip.routeName ? text(locale, `Pickup ${countedRiders.length} 人 · ${trip.capacity} 座`, `Pickup ${countedRiders.length} · ${trip.capacity} seats`) : text(locale, `Pickup ${countedRiders.length}/${trip.capacity} 个座位`, `Pickup ${countedRiders.length} of ${trip.capacity} seats`)}</span>
      </div>
      <div className="manifest-list">
        {[...visibleRiders].sort((a,b)=>Number(Boolean(a.otherVehicle))-Number(Boolean(b.otherVehicle)) || a.classroomName.localeCompare(b.classroomName) || a.name.localeCompare(b.name)).map((rider) => (
          <div className="rider-row" style={rider.otherVehicle ? {opacity:0.55,background:"#f2f3f3"}:undefined} key={rider.id}>
            <div className="student-photo">
              {rider.photoUrl ? <StudentPhotoPreview src={rider.photoUrl} name={rider.name} locale={locale} sizes="80px"/> : <UsersRound size={28} aria-label={text(locale, "照片待补充", "Photo pending")} />}
            </div>
            <div className="rider-primary">
              <strong>{rider.name}</strong>
              <span>{rider.classroomName} · {text(locale, "年级", "Grade")} {rider.grade || text(locale, "待定", "pending")} · {text(locale, "年龄", "Age")} {rider.age ?? text(locale, "待定", "pending")}</span>
            </div>
            {showParentContact && <div className="rider-contact">
              <small>{text(locale, "家长", "Parent")}</small>
              <span>{rider.parentPhone ? <a href={`tel:${rider.parentPhone}`}>{rider.parentName} · {rider.parentPhone}</a> : text(locale, "家长联系方式待补充", "Parent contact pending")}</span>
            </div>}
            {rider.otherVehicle ? <span>{text(locale,`已由 ${rider.otherVehicle} ${["ABSENT","EXCEPTION"].includes(rider.status)?"处理":"接走"}`,`${["ABSENT","EXCEPTION"].includes(rider.status)?"Handled":"Picked up"} by ${rider.otherVehicle}`)}</span> : <StatusBadge status={rider.status} />}
            {interactive && selectedStopIndex === currentIndex && !rider.otherVehicle && !["DRAFT", "CANCELED", "COMPLETED"].includes(trip.status) && !trip.completedSegments?.includes(`${rider.pickupStopId}:${rider.dropoffStopId}`) ? <StatusActions role={role} targetTripId={rider.shared ? trip.id : undefined} assignmentId={rider.id} status={rider.status} parentAbsent={rider.parentAbsent} onUpdated={onUpdated} /> : null}
            {rider.status === 'EXCEPTION' && rider.missedPickupNote && <div className="rider-parent-note">{rider.missedPickupNote}</div>}
            {(rider.parentNote || rider.parentAbsent) && <div className="rider-parent-note">{rider.parentAbsent && <strong>{text(locale, "家长请假", "Parent absence")} · </strong>}{rider.parentNote}</div>}
          </div>
        ))}
      </div>
    </>;
}
