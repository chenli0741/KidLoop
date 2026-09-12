"use client";

import { useMemo, useState } from "react";

export type AccountStudent = {
  id: string;
  name: string;
  schoolId: string;
  schoolName: string;
};

export function StudentSchoolChecklist({
  students,
  selectedIds = [],
  legend,
  schoolLabel,
  allSchoolsLabel,
}: {
  students: AccountStudent[];
  selectedIds?: string[];
  legend: string;
  schoolLabel: string;
  allSchoolsLabel: string;
}) {
  const [schoolId, setSchoolId] = useState("");
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const schools = useMemo(() => {
    const names = new Map<string, string>();
    for (const student of students) names.set(student.schoolId, student.schoolName);
    return [...names].sort((a, b) => a[1].localeCompare(b[1]));
  }, [students]);

  return <fieldset className="student-checklist school-filtered-checklist">
    <legend>{legend}</legend>
    <label className="student-school-filter">
      <span>{schoolLabel}</span>
      <select value={schoolId} onChange={(event) => setSchoolId(event.target.value)}>
        <option value="">{allSchoolsLabel}</option>
        {schools.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </select>
    </label>
    <div className="student-checklist-options">
      {students.map((student) => <label key={student.id} hidden={Boolean(schoolId && student.schoolId !== schoolId)}>
        <input name="studentIds" type="checkbox" value={student.id} defaultChecked={selected.has(student.id)} />
        <span><strong>{student.name}</strong><small>{student.schoolName}</small></span>
      </label>)}
    </div>
  </fieldset>;
}
