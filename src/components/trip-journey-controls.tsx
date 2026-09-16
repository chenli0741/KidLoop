"use client";
import { Check, Play, MapPin, Flag } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {withOperationTimeout} from "@/lib/operation-timeout";
import { captureOperationLocation } from "@/lib/capture-operation-location";
import { advanceTripStop } from "@/app/driver/actions";
import { text, type Locale } from "@/lib/i18n";
import type { Trip } from "@/lib/types";
import type { TripExecution } from "@/lib/trip-execution";

export function TripJourneyControls({ trip, locale, onUpdated }: { trip: Trip; locale: Locale; onUpdated: (update: TripExecution) => void }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const saving=useRef(false);
  const [error, setError] = useState("");
  if (!trip.routeStops?.length) return null;
  if (!['PUBLISHED','IN_PROGRESS'].includes(trip.status)) return error ? <p className="inline-error" role="alert">{error}</p> : null;
  const index = trip.currentStopIndex ?? 0;
  const stop = trip.routeStops?.[index];
  const inTransit = trip.progressState === "IN_TRANSIT";
  const atStopRiders = stop ? trip.riders.filter(r => r.pickupStopId === stop.id || r.dropoffStopId === stop.id) : trip.riders;
  const pendingRiders = stop?.schoolId ? atStopRiders.filter(r => r.pickupStopId === stop.id && r.status === "SCHEDULED").length : 0;
  const dropoffRiders = stop?.programId ? atStopRiders.filter(r => r.dropoffStopId === stop.id && r.status === "PICKED_UP").length : 0;
  const finishing = !inTransit && index === trip.routeStops.length - 1 && dropoffRiders === 0 && pendingRiders === 0;
  const action = inTransit ? "ARRIVE" : dropoffRiders ? "DROP_OFF" : "GO";
  const target = dropoffRiders ? stop : trip.routeStops[Math.min(index + 1, trip.routeStops.length - 1)];
  const targetName = target?.name ?? "";
  const label = finishing ? { zh: "结束行程", en: "Finish trip" } : inTransit ? { zh: `到达 · ${targetName}`, en: `Arrive · ${targetName}` } : dropoffRiders ? { zh: `全部送达 · ${targetName}`, en: `Drop off all · ${targetName}` } : { zh: `出发 · ${targetName}`, en: `GO · ${targetName}` };
  return <div className="trip-journey-controls">
    <button type="button" className="button primary trip-start-button" disabled={pending || pendingRiders > 0} onClick={async () => {
      if(saving.current)return;
      saving.current=true;setPending(true);setError("");
      try { const location=await captureOperationLocation(); onUpdated(await withOperationTimeout(advanceTripStop(trip.id,action,location))); } catch { setError(text(locale, "尚未确认操作结果，正在核对状态。请先刷新核对，不要连续重复操作。", "Result not confirmed. Checking status. Refresh and verify before retrying.")); window.dispatchEvent(new Event("kidloop:execution-refresh")); router.refresh(); } finally {saving.current=false;setPending(false);}
    }}><>{finishing ? <Flag size={18}/> : inTransit ? <MapPin size={18}/> : dropoffRiders ? <Check size={18}/> : <Play size={18}/>}</>{pending ? text(locale, "处理中…", "Saving…") : text(locale, label.zh, label.en)}</button>
    {pendingRiders > 0 && <span className="form-hint">{text(locale, `还有 ${pendingRiders} 名学生待接到`, `${pendingRiders} rider(s) still waiting for pickup`)}</span>}
    {error && <p className="inline-error" role="alert">{error} <button type="button" className="button compact secondary" onClick={()=>window.location.reload()}>{text(locale,"刷新页面","Reload page")}</button></p>}
  </div>;
}
