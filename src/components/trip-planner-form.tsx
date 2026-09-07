"use client";

import { useActionState, useMemo, useState } from "react";
import { CheckCircle2, Route, TriangleAlert } from "lucide-react";
import { createTrip } from "@/app/actions";
import type { FormState, Program, School, Shift, Student } from "@/lib/types";
import { formatTime } from "@/lib/date";

const initialState: FormState = { ok: false, message: "" };

export function TripPlannerForm({ date, shifts, schools, programs, students }: {
  date: string; shifts: Shift[]; schools: School[]; programs: Program[]; students: Student[];
}) {
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
      <label className="full"><span>Driver shift</span><select name="shiftId" defaultValue="" required><option value="" disabled>Select driver and vehicle</option>{shifts.map((shift) => <option key={shift.id} value={shift.id}>{formatTime(shift.startTime)}–{formatTime(shift.endTime)} · {shift.driverName} · {shift.vehicleName} ({shift.capacity})</option>)}</select></label>
      <label><span>Pickup school</span><select name="schoolId" value={schoolId} onChange={(event) => setSchoolId(event.target.value)} required><option value="" disabled>Select school</option>{schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}</select></label>
      <label><span>Dropoff program</span><select name="programId" value={programId} onChange={(event) => setProgramId(event.target.value)} required><option value="" disabled>Select program</option>{programs.map((program) => <option key={program.id} value={program.id}>{program.name}</option>)}</select></label>
      <label><span>Departure time</span><input name="departureTime" type="time" required /></label>
      <fieldset className="student-checklist full">
        <legend>Students</legend>
        {!schoolId || !programId ? <p>Select a school and program to load eligible students.</p> : eligible.length ? eligible.map((student) => (
          <label key={student.id}>
            <input type="checkbox" name="studentIds" value={student.id} />
            <span><strong>{student.name}</strong><small>{student.classroomName} · Grade {student.grade}</small></span>
          </label>
        )) : <p>No students match this route.</p>}
      </fieldset>
      <div className="form-footer full">
        {state.message ? <p className={state.ok ? "form-message success" : "form-message error"}>{state.ok ? <CheckCircle2 size={15} /> : <TriangleAlert size={15} />}{state.message}</p> : <span />}
        <button className="button primary" type="submit" disabled={pending || !eligible.length}><Route size={17} /> {pending ? "Publishing..." : "Publish trip"}</button>
      </div>
    </form>
  );
}
