import { PhotoUpload } from "@/components/photo-upload";
import { RecordActions } from "@/components/record-actions";
import { deleteStudent, updateStudent } from "@/app/students/actions";
import { editableNote } from "@/lib/student-management";
import { text, type Locale } from "@/lib/i18n";
import type { School, Program, Student } from "@/lib/types";
import { StudentWeekdays } from './student-weekdays';

export function StudentRecordActions({ student, schools, programs, locale, operatingTermId }: { operatingTermId:string; student: Student; schools: School[]; programs: Program[]; locale: Locale }) {
  return (
    <RecordActions hiddenFields={{operatingTermId}} id={student.id} name={student.name} updatedAt={student.updatedAt} update={updateStudent} remove={deleteStudent}
      editTitle={text(locale, "编辑学生", "Edit student")}
      deleteDescription={text(locale, "删除后，该学生将从名册中移除，不能再安排新行程。已有接送行程和历史记录会保留，删除不会取消已有行程。", "The student will leave the roster and cannot be assigned new trips. Existing trips and history are retained; deletion does not cancel existing trips.")}>
      <label><span>{text(locale, "学生姓名", "Student name")}</span><input name="name" defaultValue={student.name} maxLength={200} required /></label>
      <label><span>{text(locale, "学校", "School")}</span><select name="schoolId" defaultValue={student.schoolId} required>{schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}</select></label>
      <label><span>{text(locale, "班级", "Class")}</span><input name="classroomName" defaultValue={student.classroomName} maxLength={100}/></label>
      <StudentWeekdays locale={locale} selected={student.noPickupWeekdays}/>
      <label><span>{text(locale, "课外班", "After-school program")}</span><select name="programId" defaultValue={student.programId} required>{programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label><span>{text(locale, "年级", "Grade")}</span><input name="grade" defaultValue={student.grade} maxLength={30} /></label>
      <label><span>{text(locale, "年龄", "Age")}</span><input name="age" defaultValue={student.age ?? ""} type="number" min={3} max={20} step={1} /></label>
      <label><span>{text(locale, "家长姓名", "Parent name")}</span><input name="parentName" defaultValue={student.parentName} maxLength={200} /></label>
      <label><span>{text(locale, "与学生关系", "Relationship")}</span><input name="relationship" defaultValue={student.relationship} maxLength={80} /></label>
      <label><span>{text(locale, "家长电话", "Parent phone")}</span><input name="parentPhone" type="tel" defaultValue={student.parentPhone} maxLength={80} /></label>
      <label><span>{text(locale, "备用电话", "Backup phone")}</span><input name="backupPhone" type="tel" defaultValue={student.backupPhone} maxLength={80} /></label>
      <label><span>{text(locale, "家长邮箱", "Parent email")}</span><input name="email" type="email" defaultValue={student.email} maxLength={254} /></label>
      <PhotoUpload current={student.photoUrl} />
      <label className="full"><span>{text(locale, "接送备注", "Pickup notes")}</span><textarea name="notes" rows={3} defaultValue={editableNote(student.notes)} maxLength={4000} /></label>
    </RecordActions>
  );
}
