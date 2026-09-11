"use client";
import { Check, Play, MapPin } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { captureOperationLocation } from "@/lib/capture-operation-location";
import { advanceTripStop } from "@/app/driver/actions";
import { text, type Locale } from "@/lib/i18n";
import type { Trip } from "@/lib/types";
import type { TripExecution } from "@/lib/trip-execution";

export function TripJourneyControls({ trip, locale, onUpdated }: { trip: Trip; locale: Locale; onUpdated: (update: TripExecution) => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  if (!trip.routeStops?.length) return null;
  if (!['PUBLISHED','IN_PROGRESS'].includes(trip.status)) return error ? <p className="inline-error" role="alert">{error}</p> : null;
  const index = trip.currentStopIndex ?? 0;
  const stop = trip.routeStops?.[index];
  const inTransit = trip.progressState === "IN_TRANSIT";
  const atStopRiders = stop ? trip.riders.filter(r => r.pickupStopId === stop.id || r.dropoffStopId === stop.id) : trip.riders;
  const pendingRiders = stop?.schoolId ? atStopRiders.filter(r => r.pickupStopId === stop.id && r.status === "SCHEDULED").length : 0;
  const dropoffRiders = stop?.programId ? atStopRiders.filter(r => r.dropoffStopId === stop.id && r.status === "PICKED_UP").length : 0;
  const action = inTransit ? "ARRIVE" : dropoffRiders ? "DROP_OFF" : "GO";
  const target = inTransit ? trip.routeStops[Math.min(index + 1, trip.routeStops.length - 1)] : stop;
  const targetName = target?.name ?? "";
  const label = inTransit ? { zh: `到达 · ${targetName}`, en: `Arrive · ${targetName}` } : dropoffRiders ? { zh: `送达 · ${targetName}`, en: `Drop off · ${targetName}` } : { zh: `前往 · ${targetName}`, en: `GO · ${targetName}` };
  return <div className="trip-journey-controls">
    <button type="button" className="button primary trip-start-button" disabled={pending || pendingRiders > 0} onClick={() => {
      setError("");
      startTransition(async () => { try { const location=await captureOperationLocation(); onUpdated(await advanceTripStop(trip.id,action,location)); } catch { setError(text(locale, "操作失败，请刷新后重试。", "Could not update this stop. Refresh and try again.")); router.refresh(); } });
    }}><>{inTransit ? <MapPin size={18}/> : dropoffRiders ? <Check size={18}/> : <Play size={18}/>}</>{pending ? text(locale, "处理中…", "Saving…") : text(locale, label.zh, label.en)}</button>
    {pendingRiders > 0 && <span className="form-hint">{text(locale, `还有 ${pendingRiders} 名学生待接到`, `${pendingRiders} rider(s) still waiting for pickup`)}</span>}
    {error && <p className="inline-error" role="alert">{error}</p>}
  </div>;
}
