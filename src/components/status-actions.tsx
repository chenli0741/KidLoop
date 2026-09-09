"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";
import { AlertTriangle, Check, RotateCcw, UserCheck, UserX } from "lucide-react";
import { updateRiderStatus } from "@/app/actions";
import { useLocale } from "@/components/locale-provider";
import { text } from "@/lib/i18n";
import type { RiderStatus } from "@/lib/types";
import { missedPickupReasons } from "@/lib/missed-pickup";
import type { TripExecution } from "@/lib/trip-execution";

export function StatusActions({ assignmentId, status, onUpdated, targetTripId }: { targetTripId?: string; assignmentId: string; status: RiderStatus; onUpdated: (update: TripExecution) => void }) {
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [reason, setReason] = useState<string>(missedPickupReasons[0].id);
  const [parentNotified, setParentNotified] = useState(false);

  function update(next: RiderStatus) {
    setError("");
    startTransition(async () => {
      try {
        const result = await updateRiderStatus(assignmentId, next, next === "EXCEPTION" ? { reason, parentNotified } : undefined, targetTripId);
        dialog.current?.close();
        onUpdated(result);
      } catch {
        router.refresh();
        setError(text(locale, "未能登记，名单已刷新。孩子可能已被另一车接走，或本车座位已满。", "Could not save. Refreshing: rider may be on another vehicle or seats are full."));
      }
    });
  }

  if (status === "ABSENT" || status === "EXCEPTION") {
    return <span className="status-complete"><Check size={16} /> {text(locale, "完成", "Complete")}</span>;
  }

  return (
    <div className="status-actions">
      <div className="status-button-row">
        {status === "SCHEDULED" ? (
          <button type="button" className="button compact primary" disabled={pending} onClick={() => update("PICKED_UP")}>
            <UserCheck size={16} /> {text(locale, "已接到", "Picked up")}
          </button>
        ) : null}
        {status === "PICKED_UP" ? (
          <button type="button" className="icon-button" title={text(locale, "撤销接到，恢复待接送", "Undo pickup, return to scheduled")} aria-label={text(locale, "撤销接到", "Undo pickup")} disabled={pending} onClick={() => update("SCHEDULED")}>
            <RotateCcw size={17} />
          </button>
        ) : null}
        {status === "DROPPED_OFF" ? (
          <button type="button" className="icon-button" title={text(locale, "撤销送达，恢复已接到", "Undo drop-off, return to picked up")} aria-label={text(locale, "撤销送达", "Undo drop-off")} disabled={pending} onClick={() => update("PICKED_UP")}>
            <RotateCcw size={17} />
          </button>
        ) : null}
        {status === "SCHEDULED" || status === "PICKED_UP" ? (
          <button type="button" className="icon-button" title={text(locale, "标记缺席", "Mark absent")} aria-label={text(locale, "标记缺席", "Mark absent")} disabled={pending} onClick={() => update("ABSENT")}>
            <UserX size={17} />
          </button>
        ) : null}
        {status === "SCHEDULED" ? (
          <button type="button" className="icon-button danger" title={text(locale, "未接到", "Not picked up")} aria-label={text(locale, "未接到", "Not picked up")} disabled={pending} onClick={() => { setError(""); setParentNotified(false); dialog.current?.showModal(); }}>
            <AlertTriangle size={17} />
          </button>
        ) : null}
      </div>
      {error ? <span className="inline-error">{error}</span> : null}
      <dialog ref={dialog} className="record-dialog" aria-labelledby={`${id}-title`} onCancel={event => { if (pending) event.preventDefault(); }}>
        <h2 id={`${id}-title`}>{text(locale, "未接到", "Not picked up")}</h2>
        <label htmlFor={`${id}-reason`}>{text(locale, "原因", "Reason")}</label>
        <select id={`${id}-reason`} value={reason} disabled={pending} onChange={event => setReason(event.target.value)}>
          {missedPickupReasons.map(item => <option key={item.id} value={item.id}>{item[locale]}</option>)}
        </select>
        <label className="record-checkbox"><input type="checkbox" checked={parentNotified} disabled={pending} onChange={event => setParentNotified(event.target.checked)} />{text(locale, "已通知家长自行安排接送", "Parent notified to arrange pickup")}</label>
        {error && <p role="alert">{error}</p>}
        <div className="segment-finish">
          <button type="button" className="button secondary" disabled={pending} onClick={() => dialog.current?.close()}>{text(locale, "取消", "Cancel")}</button>
          <button type="button" className="button primary" disabled={pending || !parentNotified} onClick={() => update("EXCEPTION")}>{text(locale, "确认未接到", "Confirm not picked up")}</button>
        </div>
      </dialog>
    </div>
  );
}
