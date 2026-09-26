"use client";

import {withOperationTimeout} from "@/lib/operation-timeout";
import {captureOperationLocation} from "@/lib/capture-operation-location";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { AlertTriangle, Check, RotateCcw, UserCheck, UserX } from "lucide-react";
import { listStudentStatusReasons } from "@/app/actions";
import { useLocale } from "@/components/locale-provider";
import { text } from "@/lib/i18n";
import type { RiderStatus } from "@/lib/types";
import { missedPickupReasons, type StudentStatusReason } from "@/lib/missed-pickup";
import type { TripExecution } from "@/lib/trip-execution";

export function StatusActions({ tripId, assignmentId, status, parentAbsent = false, atDropoff = false, onUpdated, targetTripId, role = "DRIVER" }: { tripId: string; atDropoff?: boolean; targetTripId?: string; assignmentId: string; status: RiderStatus; parentAbsent?: boolean; role?: "ADMIN" | "DRIVER"; onUpdated: (update: TripExecution) => void }) {
  const locale = useLocale();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const saving = useRef(false);
  const [error, setError] = useState<{message:string;expectedStatus:RiderStatus|null}|null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [reason, setReason] = useState<string>(missedPickupReasons[0].id);
  const [reasons, setReasons] = useState<StudentStatusReason[]>([...missedPickupReasons]);
  const reasonStatus: RiderStatus = role === "ADMIN" ? "ABSENT" : "EXCEPTION";
  const visibleError=error&&status!==error.expectedStatus?error.message:"";
  function openReasonDialog(){
    setError(null);setReason(reasons[0]?.id ?? "OTHER");dialog.current?.showModal();
    void listStudentStatusReasons().then(setReasons).catch(()=>undefined);
  }

  async function confirmSavedStatus(next:RiderStatus){
    for(let attempt=0;attempt<5;attempt++){
      try{
        const response=await fetch(`/api/trip-execution?trip=${tripId}`,{cache:"no-store",signal:AbortSignal.timeout(5000)});
        if(response.ok){
          const update:TripExecution=await response.json();
          if(update.riders.some(rider=>rider.id===assignmentId&&rider.status===next)){onUpdated(update);setError(null);return true;}
        }
      }catch{/* The regular live refresh continues independently. */}
      if(attempt<4)await new Promise(resolve=>setTimeout(resolve,1000));
    }
    return false;
  }

  async function update(next: RiderStatus) {
    if(saving.current)return;
    saving.current=true;setPending(true);setError(null);
      try {
        const location = await captureOperationLocation();
        const response = await withOperationTimeout(fetch("/api/rider-status", {
          method: "POST",
          headers: {"Content-Type":"application/json"},
          body: JSON.stringify({assignmentId,nextStatus:next,details:next === "EXCEPTION" || next === "ABSENT" ? {reason} : undefined,targetTripId,location}),
        }));
        if(!response.ok)throw new Error("Rider status update was not confirmed");
        const result:TripExecution=await response.json();
        dialog.current?.close();
        const rider=result.riders.find(item=>item.id===assignmentId);
        onUpdated({...result,partial:true,riders:rider?[rider]:[]});
      } catch {
        window.dispatchEvent(new Event('kidloop:execution-refresh'));
        setError({expectedStatus:next,message:text(locale,"尚未确认操作结果，正在核对状态。请先核对名单；若仍未更新，请点刷新页面，不必关闭 App。","Result not confirmed. Checking status; verify the roster before retrying. Reload this page if it does not update.")});
        if(!await confirmSavedStatus(next))router.refresh();
      } finally {saving.current=false;setPending(false);}
  }

  if (status === "ABSENT" || status === "EXCEPTION" || (role === "DRIVER" && parentAbsent)) {
    return <span className="status-complete"><Check size={16} /> {parentAbsent && role === "DRIVER" ? text(locale, "管理员已请假", "Admin marked absent") : text(locale, "完成", "Complete")}</span>;
  }

  return (
    <div className="status-actions" aria-busy={pending}>
      <div className="status-button-row">
        {atDropoff && status === "PICKED_UP" ? <button type="button" className="button compact primary" disabled={pending} onClick={() => update("DROPPED_OFF")}><Check size={16}/>{text(locale,"送达","Drop off")}</button> : null}
        {role === "DRIVER" && status === "SCHEDULED" ? (
          <button type="button" className="button compact primary" disabled={pending} onClick={() => update("PICKED_UP")}>
            <UserCheck size={16} /> {text(locale, "已接到", "Picked up")}
          </button>
        ) : null}
        {role === "DRIVER" && status === "PICKED_UP" && !atDropoff ? (
          <button type="button" className="button compact secondary" title={text(locale, "撤销接到，恢复待接送", "Undo pickup, return to scheduled")} disabled={pending} onClick={() => update("SCHEDULED")}>
            <RotateCcw size={15} /> {text(locale,"撤销接到","Undo pickup")}
          </button>
        ) : null}
        {role === "DRIVER" && status === "DROPPED_OFF" ? (
          <button type="button" className="button compact secondary" title={text(locale, "撤销送达，恢复已接到", "Undo drop-off, return to picked up")} disabled={pending} onClick={() => update("PICKED_UP")}>
            <RotateCcw size={15} /> {text(locale,"撤销送达","Undo drop-off")}
          </button>
        ) : null}
        {role === "ADMIN" && (status === "SCHEDULED" || status === "PICKED_UP") ? (
          <button type="button" className="icon-button" title={text(locale, "标记缺席", "Mark absent")} aria-label={text(locale, "标记缺席", "Mark absent")} disabled={pending} onClick={openReasonDialog}>
            <UserX size={17} />
          </button>
        ) : null}
        {role === "DRIVER" && status === "SCHEDULED" ? (
          <button type="button" className="icon-button danger" title={text(locale, "特殊原因", "Special reason")} aria-label={text(locale, "特殊原因", "Special reason")} disabled={pending} onClick={openReasonDialog}>
            <AlertTriangle size={17} />
          </button>
        ) : null}
      </div>
      {pending && <span className="status-saving" role="status">{text(locale,"正在保存…","Saving…")}</span>}
      {visibleError ? <span className="inline-error" role="alert">{visibleError} <button type="button" className="button compact secondary" onClick={()=>window.location.reload()}>{text(locale,"刷新页面","Reload page")}</button></span> : null}
      <dialog ref={dialog} className="record-dialog" aria-labelledby={`${id}-title`} onCancel={event => { if (pending) event.preventDefault(); }}>
        <h2 id={`${id}-title`}>{text(locale, role === "ADMIN" ? "缺席原因" : "特殊原因", role === "ADMIN" ? "Absence reason" : "Special reason")}</h2>
        <label htmlFor={`${id}-reason`}>{text(locale, "原因", "Reason")}</label>
        <select id={`${id}-reason`} value={reason} disabled={pending} onChange={event => setReason(event.target.value)}>
          {reasons.map(item => <option key={item.id} value={item.id}>{item[locale]}</option>)}
        </select>
        {visibleError && <p role="alert">{visibleError}</p>}
        <div className="segment-finish">
          <button type="button" className="button secondary" disabled={pending} onClick={() => dialog.current?.close()}>{text(locale, "取消", "Cancel")}</button>
          <button type="button" className="button primary" disabled={pending || !reason} onClick={() => update(reasonStatus)}>{text(locale, role === "ADMIN" ? "确认缺席" : "确认特殊原因", role === "ADMIN" ? "Confirm absence" : "Confirm reason")}</button>
        </div>
      </dialog>
    </div>
  );
}
