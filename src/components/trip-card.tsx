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
import { tripSegments } from "@/lib/trip-segments";
import { TripSegmentPicker } from "@/components/trip-segment-picker";
import { applyTripExecution, type TripExecution } from "@/lib/trip-execution";

export function TripCard({ trip: source, locale, interactive = true, cameraEnabled = false, showParentContact = true }: { trip: Trip; locale: Locale; cameraEnabled?: boolean; showParentContact?: boolean; interactive?: boolean }) {
  const [state, setState] = useState({ source, trip: source });
  let trip = state.trip;
  if (state.source !== source) {
    trip = (source.executionVersion ?? '') >= (state.trip.executionVersion ?? '') ? source : state.trip;
    setState({ source, trip });
  }
  const refreshEpoch = useRef(0);
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
    setState(previous => ({ ...previous, trip: applyTripExecution(previous.trip, update) }));
  }
  const completed = trip.riders.filter((rider) => !rider.otherVehicle && ['DROPPED_OFF','ABSENT','EXCEPTION'].includes(rider.status)).length;
  const segments = tripSegments(trip);
  const paired = segments.every(s=>s.routeStops?.length===2 && s.riders.length>0 && s.riders.every(r=>r.pickupStopId===s.routeStops![0].id && r.dropoffStopId===s.routeStops![1].id));

  return (
    <article className="trip-card">
      {syncFailed&&<p role="alert">{text(locale,"名单同步中断，正在重试。请联网后核对再操作。","Manifest sync interrupted. Retrying; reconnect and verify before updating.")}</p>}
      <header className="trip-header">
        <div>
          <div className="eyebrow">{formatTime(trip.departureTime, locale)} {text(locale, "出发", "departure")}</div>
          <h3>{segments.length > 1 ? text(locale, "接送行程", "Pickup trips") : segments[0].routeName ?? <>{trip.schoolName} <span>{text(locale, "至", "to")}</span> {trip.programName}</>}</h3>
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

      {paired ? <TripSegmentPicker key={`${trip.id}:${trip.completedSegments?.join(',')}`} tripId={trip.id} locale={locale} onUpdated={onUpdated} interactive={interactive && !['DRAFT','CANCELED'].includes(trip.status)} options={segments.map(segment=>{
        const id=`${segment.routeStops![0].id}:${segment.routeStops!.at(-1)!.id}`;
        return {id,stops:segment.routeStops!,done:trip.completedSegments?.includes(id)??false,pendingPickups:segment.riders.filter(r=>!r.otherVehicle&&!['PICKED_UP','DROPPED_OFF','ABSENT','EXCEPTION'].includes(r.status)).length};
      })}>
      {segments.map((segment,i)=><section className="trip-segment" key={`${segment.routeStops?.[0]?.id ?? trip.id}:${segment.routeStops?.at(-1)?.id ?? i}`}>
        <TripSegmentContent showParentContact={showParentContact} cameraEnabled={cameraEnabled} trip={segment} locale={locale} interactive={interactive} showStops={false} onUpdated={onUpdated}/>
      </section>)}
      </TripSegmentPicker> : <TripSegmentContent showParentContact={showParentContact} cameraEnabled={cameraEnabled} trip={trip} locale={locale} interactive={interactive} onUpdated={onUpdated}/>}
    </article>
  );
}

function TripSegmentContent({trip,locale,interactive,onUpdated,showStops=true,cameraEnabled=false,showParentContact=true}:{trip:Trip;locale:Locale;interactive:boolean;onUpdated:(update:TripExecution)=>void;showStops?:boolean;cameraEnabled?:boolean;showParentContact?:boolean}) {
  return <>

      {showStops && (trip.routeStops?.length ? <ol className="fixed-trip-stops">{trip.routeStops.map((stop,i)=><li key={stop.id}><span className="fixed-stop-number">{i+1}</span><div><small>{stop.time}</small><strong>{stop.name}</strong><details className="route-notes"><summary>{text(locale,"地址与地图","Address & map")}</summary><p>{stop.address}</p><LocationMap name={stop.name} address={stop.address}/></details></div></li>)}</ol> : <div className="route-strip">
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

      {cameraEnabled && interactive && !["DRAFT","CANCELED","COMPLETED"].includes(trip.status) && <PickupCamera trip={trip} locale={locale} onUpdated={onUpdated}/>}
      <div className="manifest-header">
        <h4>{text(locale, "接送学生清单", "Pickup manifest")}</h4>
        <span>{trip.hasSharedPickups ? text(locale,`${trip.riders.filter(r=>!r.otherVehicle&&r.status==='PICKED_UP').length} 人本车已接 · ${trip.capacity} 座 · ${trip.riders.filter(r=>r.status==='SCHEDULED').length} 人待接`,`${trip.riders.filter(r=>!r.otherVehicle&&r.status==='PICKED_UP').length} picked up here · ${trip.capacity} seats · ${trip.riders.filter(r=>r.status==='SCHEDULED').length} pending`) : trip.routeName ? text(locale, `${trip.riders.length} 名学生 · ${trip.capacity} 座`, `${trip.riders.length} riders · ${trip.capacity} seats`) : text(locale, `${trip.riders.length}/${trip.capacity} 个座位`, `${trip.riders.length} of ${trip.capacity} seats`)}</span>
      </div>
      <div className="manifest-list">
        {[...trip.riders].sort((a,b)=>Number(Boolean(a.otherVehicle))-Number(Boolean(b.otherVehicle)) || a.classroomName.localeCompare(b.classroomName) || a.name.localeCompare(b.name)).map((rider) => (
          <div className="rider-row" style={rider.otherVehicle ? {opacity:0.55,background:"#f2f3f3"}:undefined} key={rider.id}>
            <div className="student-photo">
              {rider.photoUrl ? <StudentPhotoPreview src={rider.photoUrl} name={rider.name} locale={locale} sizes="80px"/> : <UsersRound size={28} aria-label={text(locale, "照片待补充", "Photo pending")} />}
            </div>
            <div className="rider-primary">
              <strong>{rider.name}</strong>
              {trip.routeStops && <span>{trip.routeStops.find(s=>s.id===rider.pickupStopId)?.name} → {trip.routeStops.find(s=>s.id===rider.dropoffStopId)?.name}</span>}
              <span>{rider.classroomName} · {text(locale, "年级", "Grade")} {rider.grade || text(locale, "待定", "pending")} · {text(locale, "年龄", "Age")} {rider.age ?? text(locale, "待定", "pending")}</span>
            </div>
            {showParentContact && <div className="rider-contact">
              <small>{text(locale, "家长", "Parent")}</small>
              <span>{rider.parentPhone ? <a href={`tel:${rider.parentPhone}`}>{rider.parentName} · {rider.parentPhone}</a> : text(locale, "家长联系方式待补充", "Parent contact pending")}</span>
            </div>}
            {rider.otherVehicle ? <span>{text(locale,`已由 ${rider.otherVehicle} ${["ABSENT","EXCEPTION"].includes(rider.status)?"处理":"接走"}`,`${["ABSENT","EXCEPTION"].includes(rider.status)?"Handled":"Picked up"} by ${rider.otherVehicle}`)}</span> : <StatusBadge status={rider.status} />}
            {interactive && !rider.otherVehicle && !["DRAFT", "CANCELED"].includes(trip.status) ? <StatusActions targetTripId={rider.shared ? trip.id : undefined} assignmentId={rider.id} status={rider.status} onUpdated={onUpdated} /> : null}
            {rider.status === 'EXCEPTION' && rider.missedPickupNote && <div className="rider-parent-note">{rider.missedPickupNote}</div>}
            {(rider.parentNote || rider.parentAbsent) && <div className="rider-parent-note">{rider.parentAbsent && <strong>{text(locale, "家长请假", "Parent absence")} · </strong>}{rider.parentNote}</div>}
          </div>
        ))}
      </div>
    </>;
}
