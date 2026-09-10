"use client";
import { Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { captureOperationLocation } from "@/lib/capture-operation-location";
import { startTrip } from "@/app/driver/actions";
import { text, type Locale } from "@/lib/i18n";
import type { TripStatus } from "@/lib/types";
import type { TripExecution } from "@/lib/trip-execution";

export function TripJourneyControls({ tripId, status, locale, onUpdated }: { tripId: string; status: TripStatus; locale: Locale; onUpdated: (update: TripExecution) => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  if (status !== "PUBLISHED") return error ? <p className="inline-error" role="alert">{error}</p> : null;
  return <div className="trip-journey-controls">
    <button type="button" className="button primary trip-start-button" disabled={pending} onClick={() => {
      setError("");
      startTransition(async () => { try { onUpdated(await startTrip(tripId, await captureOperationLocation())); } catch { setError(text(locale, "出发登记失败，请刷新后重试。", "Could not start this trip. Refresh and try again.")); router.refresh(); } });
    }}><Play size={18} />{pending ? text(locale, "登记中…", "Starting…") : text(locale, "出发", "Start trip")}</button>
    {error && <p className="inline-error" role="alert">{error}</p>}
  </div>;
}
