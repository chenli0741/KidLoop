"use client";
import { useActionState } from "react";
import { updateDayPlan } from "@/app/parent/actions";
import { useLocale } from "@/components/locale-provider";
import { text } from "@/lib/i18n";

export function DayPlanForm({ studentId, date, absent, note }: { studentId: string; date: string; absent: boolean; note: string }) {
  const locale = useLocale();
  const [state, action, pending] = useActionState(updateDayPlan, { ok: false, message: "" });
  return <form action={action} className="form-grid day-plan-form">
    <input type="hidden" name="studentId" value={studentId} /><input type="hidden" name="date" value={date} />
    <label className="full"><span>{text(locale, "当天出勤", "Attendance for this date")}</span><select name="attendance" defaultValue={absent ? "absent" : "attending"}><option value="attending">{text(locale, "正常参加（取消家长请假）", "Attending (cancel parent absence)")}</option><option value="absent">{text(locale, "当天缺席，不需接送", "Absent — no ride needed")}</option></select></label>
    <label className="full"><span>{text(locale, "特殊要求 / 留言", "Special requests / note")}</span><textarea name="note" rows={3} maxLength={1000} defaultValue={note} placeholder={text(locale, "例如：今天由奶奶接，请到门口联系。", "For example: Grandma is collecting today. Please call at the entrance.")} /></label>
    <p className="form-hint full">{text(locale, "留言会显示给管理员和相关司机；涉及路线或接送人变更，请确认对方已知晓。", "Notes are visible to the administrator and assigned driver. Confirm any route or pickup-person changes with them.")}</p>
    {state.message && <p className={`form-message full ${state.ok ? "success" : "error"}`} role="status">{state.message}</p>}
    <button className="button primary full" disabled={pending}>{text(locale, pending ? "保存中…" : "保存当天安排", pending ? "Saving…" : "Save daily plan")}</button>
  </form>;
}
