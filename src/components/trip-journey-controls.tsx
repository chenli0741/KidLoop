"use client";
import { Check, Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { captureOperationLocation } from "@/lib/capture-operation-location";
import { completeTrip, startTrip } from "@/app/driver/actions";
import { text, type Locale } from "@/lib/i18n";
import type { Trip } from "@/lib/types";
import type { TripExecution } from "@/lib/trip-execution";

export function TripJourneyControls({ trip, locale, onUpdated }: { trip: Trip; locale: Locale; onUpdated: (update: TripExecution) => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  if (!['PUBLISHED','IN_PROGRESS'].includes(trip.status)) return error ? <p className="inline-error" role="alert">{error}</p> : null;
  const pendingRiders = trip.riders.filter(r => !r.otherVehicle && r.status === "SCHEDULED").length;
  const started = trip.status === 'IN_PROGRESS';
  return <div className="trip-journey-controls">
    <button type="button" className="button primary trip-start-button" disabled={pending || pendingRiders > 0} onClick={() => {
      setError("");
      startTransition(async () => { try { const location=await captureOperationLocation(); onUpdated(await (started ? completeTrip(trip.id,location) : startTrip(trip.id,location))); } catch { setError(text(locale, started ? "完成登记失败，请刷新后重试。" : "出发登记失败，请刷新后重试。", started ? "Could not complete this trip. Refresh and try again." : "Could not start this trip. Refresh and try again.")); router.refresh(); } });
    }}><>{started ? <Check size={18}/> : <Play size={18}/>}</>{pending ? text(locale, "处理中…", "Saving…") : started ? text(locale, "完成", "Complete") : text(locale, "出发", "Start trip")}</button>
    {pendingRiders > 0 && <span className="form-hint">{text(locale, `还有 ${pendingRiders} 名学生待接到`, `${pendingRiders} rider(s) still waiting for pickup`)}</span>}
    {error && <p className="inline-error" role="alert">{error}</p>}
  </div>;
}
