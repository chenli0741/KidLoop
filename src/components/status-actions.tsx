"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Check, RotateCcw, UserCheck, UserX } from "lucide-react";
import { updateRiderStatus } from "@/app/actions";
import { useLocale } from "@/components/locale-provider";
import { text } from "@/lib/i18n";
import type { RiderStatus } from "@/lib/types";

export function StatusActions({ assignmentId, status }: { assignmentId: string; status: RiderStatus }) {
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function update(next: RiderStatus) {
    setError("");
    startTransition(async () => {
      try {
        await updateRiderStatus(assignmentId, next);
      } catch {
        setError(text(locale, "无法更新状态。", "Could not update status."));
      }
    });
  }

  if (status === "ABSENT") {
    return <span className="status-complete"><Check size={16} /> {text(locale, "完成", "Complete")}</span>;
  }

  return (
    <div className="status-actions">
      <div className="status-button-row">
        {status === "SCHEDULED" || status === "EXCEPTION" ? (
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
        {status === "SCHEDULED" || status === "EXCEPTION" || status === "PICKED_UP" ? (
          <button type="button" className="icon-button" title={text(locale, "标记缺席", "Mark absent")} aria-label={text(locale, "标记缺席", "Mark absent")} disabled={pending} onClick={() => update("ABSENT")}>
            <UserX size={17} />
          </button>
        ) : null}
        {status !== "EXCEPTION" && status !== "DROPPED_OFF" ? (
          <button type="button" className="icon-button danger" title={text(locale, "报告异常", "Report issue")} aria-label={text(locale, "报告异常", "Report issue")} disabled={pending} onClick={() => update("EXCEPTION")}>
            <AlertTriangle size={17} />
          </button>
        ) : null}
      </div>
      {error ? <span className="inline-error">{error}</span> : null}
    </div>
  );
}
