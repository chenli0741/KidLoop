"use client";

import { useActionState, useMemo, useState } from "react";
import { CheckCircle2, Route, TriangleAlert } from "lucide-react";
import { createTrip } from "@/app/actions";
import { useLocale } from "@/components/locale-provider";
import { text } from "@/lib/i18n";
import type { FormState, Program, School, Shift, Student } from "@/lib/types";
import { formatTime } from "@/lib/date";

const initialState: FormState = { ok: false, message: "" };

export function TripPlannerForm({ date, shifts, schools, programs, students }: {
  date: string; shifts: Shift[]; schools: School[]; programs: Program[]; students: Student[];
}) {
  const locale = useLocale();
  const [state, formAction, pending] = useActionState(createTrip, initialState);
  const [schoolId, setSchoolId] = useState("");
  const [programId, setProgramId] = useState("");
  const eligible = useMemo(
    () => students.filter((student) => student.schoolId === schoolId && student.programId === programId),
    [students, schoolId, programId],
  );

  return (
    <form action={formAction} className="form-grid trip-planner-form">
      <input type="hidden" name="scheduledDate" value={date} />
      <label className="full"><span>{text(locale, "司机排班", "Driver shift")}</span><select name="shiftId" defaultValue="" required><option value="" disabled>{text(locale, "选择司机和车辆", "Select driver and vehicle")}</option>{shifts.map((shift) => <option key={shift.id} value={shift.id}>{formatTime(shift.startTime, locale)}–{formatTime(shift.endTime, locale)} · {shift.driverName} · {shift.vehicleName} ({shift.capacity})</option>)}</select></label>
      <label><span>{text(locale, "接送学校", "Pickup school")}</span><select name="schoolId" value={schoolId} onChange={(event) => setSchoolId(event.target.value)} required><option value="" disabled>{text(locale, "选择学校", "Select school")}</option>{schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}</select></label>
      <label><span>{text(locale, "送达课外班", "Dropoff program")}</span><select name="programId" value={programId} onChange={(event) => setProgramId(event.target.value)} required><option value="" disabled>{text(locale, "选择课外班", "Select program")}</option>{programs.map((program) => <option key={program.id} value={program.id}>{program.name}</option>)}</select></label>
      <label><span>{text(locale, "出发时间", "Departure time")}</span><input name="departureTime" type="time" required /></label>
      <fieldset className="student-checklist full">
        <legend>{text(locale, "学生", "Students")}</legend>
        {!schoolId || !programId ? <p>{text(locale, "选择学校和课外班后显示可安排的学生。", "Select a school and program to load eligible students.")}</p> : eligible.length ? eligible.map((student) => (
          <label key={student.id}>
            <input type="checkbox" name="studentIds" value={student.id} />
            <span><strong>{student.name}</strong><small>{student.classroomName} · {text(locale, "年级", "Grade")} {student.grade}</small></span>
          </label>
        )) : <p>{text(locale, "没有符合该路线的学生。", "No students match this route.")}</p>}
      </fieldset>
      <div className="form-footer full">
        {state.message ? <p className={state.ok ? "form-message success" : "form-message error"}>{state.ok ? <CheckCircle2 size={15} /> : <TriangleAlert size={15} />}{state.message}</p> : <span />}
        <button className="button primary" type="submit" disabled={pending || !eligible.length}><Route size={17} /> {pending ? text(locale, "发布中...", "Publishing...") : text(locale, "发布行程", "Publish trip")}</button>
      </div>
    </form>
  );
}
