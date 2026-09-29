"use client";

import { useState } from "react";
import { CalendarRange } from "lucide-react";
import { ActionForm } from "./action-form";
import { RosterCreateDialog } from "./roster-controls";
import { addStudentServicePeriods, endStudentServicePeriods } from "@/app/students/actions";
import { text, type Locale } from "@/lib/i18n";
import type { Student } from "@/lib/types";
import type { OperatingTerm } from "@/lib/operating-terms";

export function StudentServiceControls({ students, term, locale }: { students: Student[]; term: OperatingTerm; locale: Locale }) {
  const [mode, setMode] = useState<"end" | "add">("end");
  return <RosterCreateDialog title={text(locale,"接送期间","Service dates")} closeLabel={text(locale,"关闭","Close")} icon="edit">
    <div className="service-period-mode" role="group" aria-label={text(locale,"操作","Action")}>
      <button type="button" className={mode === "end" ? "button primary compact" : "button secondary compact"} onClick={() => setMode("end")}>{text(locale,"结束接送","End")}</button>
      <button type="button" className={mode === "add" ? "button primary compact" : "button secondary compact"} onClick={() => setMode("add")}>{text(locale,"新增期间","Add period")}</button>
    </div>
    <ActionForm action={mode === "end" ? endStudentServicePeriods : addStudentServicePeriods} submitLabel={text(locale,"保存","Save")} submitIcon={<CalendarRange size={17}/> }>
      <input type="hidden" name="operatingTermId" value={term.id}/>
      <fieldset className="student-service-checklist full">
        <legend>{text(locale,"选择学生（可多选）","Students (multi-select)")}</legend>
        {students.map(student => <label key={student.id}>
          <input type="checkbox" name="studentIds" value={student.id}/>
          <span><strong>{student.name}</strong><small>{student.servicePeriods.map(period => `${period.startsOn} – ${period.endsOn}`).join(" · ")}</small></span>
        </label>)}
      </fieldset>
      {mode === "end" ? <label className="full"><span>{text(locale,"最后接送日","Last service day")}</span><input name="lastServiceDate" type="date" min={term.startsOn} max={term.endsOn} required/></label> : <>
        <label><span>{text(locale,"开始日期","Start")}</span><input name="startsOn" type="date" min={term.startsOn} max={term.endsOn} required/></label>
        <label><span>{text(locale,"结束日期","End")}</span><input name="endsOn" type="date" min={term.startsOn} max={term.endsOn} defaultValue={term.endsOn} required/></label>
      </>}
      <p className="form-hint full">{mode === "end" ? text(locale,"适合退线：选中学生并填写最后一次接送日期。","For leaving service: choose students and their last service day.") : text(locale,"再次加入时新增一段；历史期间会保留。","Add a new period when students rejoin; history is kept.")}</p>
    </ActionForm>
  </RosterCreateDialog>;
}
