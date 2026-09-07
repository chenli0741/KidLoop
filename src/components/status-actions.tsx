"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Check, UserCheck, UserX } from "lucide-react";
import { updateRiderStatus } from "@/app/actions";
import type { RiderStatus } from "@/lib/types";

export function StatusActions({ assignmentId, status }: { assignmentId: string; status: RiderStatus }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function update(next: RiderStatus) {
    setError("");
    startTransition(async () => {
      try {
        await updateRiderStatus(assignmentId, next);
      } catch {
        setError("Could not update status.");
      }
    });
  }

  if (status === "DROPPED_OFF" || status === "ABSENT") {
    return <span className="status-complete"><Check size={16} /> Complete</span>;
  }

  return (
    <div className="status-actions">
      <div className="status-button-row">
        {status === "SCHEDULED" || status === "EXCEPTION" ? (
          <button type="button" className="button compact primary" disabled={pending} onClick={() => update("PICKED_UP")}>
            <UserCheck size={16} /> Picked up
          </button>
        ) : null}
        {status === "PICKED_UP" ? (
          <button type="button" className="button compact primary" disabled={pending} onClick={() => update("DROPPED_OFF")}>
            <Check size={16} /> Dropped off
          </button>
        ) : null}
        {status === "SCHEDULED" || status === "EXCEPTION" ? (
          <button type="button" className="icon-button" title="Mark absent" aria-label="Mark absent" disabled={pending} onClick={() => update("ABSENT")}>
            <UserX size={17} />
          </button>
        ) : null}
        {status !== "EXCEPTION" ? (
          <button type="button" className="icon-button danger" title="Report issue" aria-label="Report issue" disabled={pending} onClick={() => update("EXCEPTION")}>
            <AlertTriangle size={17} />
          </button>
        ) : null}
      </div>
      {error ? <span className="inline-error">{error}</span> : null}
    </div>
  );
}
