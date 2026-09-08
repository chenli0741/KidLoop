import { db } from "@/lib/db";
import { openTerm } from "@/lib/operating-terms";
import { TermWorkspace } from "@/components/term-workspace";
import { PhotoUpload } from "@/components/photo-upload";
import { requireUser } from "@/lib/auth";
import { RosterCreateDialog, SchoolFilter } from "@/components/roster-controls";
import { StudentRecordActions } from "@/components/student-record-actions";
import Image from "next/image";
import { GraduationCap, Phone, UsersRound } from "lucide-react";
import { createStudent } from "@/app/actions";
import { StudentWeekdays } from '@/components/student-weekdays';
import { ActionForm } from "@/components/action-form";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { getPrograms, getSchools, getStudents } from "@/lib/data";
import { text } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ school?: string | string[] }> }) {
  await requireUser(["ADMIN"]);
  const locale = await getLocale();
  const operation=await openTerm(db);
  if(!operation)return <div className="page-container"><TermWorkspace locale={locale}/></div>;
  const [students, schools, programs] = await Promise.all([
    getStudents(), getSchools(), getPrograms(),
  ]);
  const requestedSchool = (await searchParams).school;
  const selectedSchool = schools.find((school) => school.id === requestedSchool) ?? schools[0];
  const visibleStudents = students.filter((student) => student.schoolId === selectedSchool?.id);
  const canAddStudent = Boolean(selectedSchool) && programs.length > 0;

  return (
    <div className="page-container">
      <TermWorkspace term={operation} locale={locale}/>
      <PageHeader eyebrow={text(locale, "学生名册", "Roster")} title={text(locale, "学生", "Students")} description={text(locale, "选择学校，查看和管理该校学生的接送资料。", "Select a school to view and manage its student roster.")} />

      <div className="roster-toolbar"><SchoolFilter schools={schools} selected={selectedSchool?.id ?? ""} label={text(locale, "学校", "School")} />
        <div className="roster-create-actions" key={selectedSchool?.id ?? "empty"}>
          <RosterCreateDialog title={text(locale, "添加学生", "Add student")} closeLabel={text(locale, "关闭", "Close")}>
            {canAddStudent ? (
              <ActionForm action={createStudent} submitLabel={text(locale, "添加学生", "Add student")}>
                <input type="hidden" name="operatingTermId" value={operation.id}/><label><span>{text(locale, "学生姓名", "Student name")}</span><input name="name" required /></label>
                <PhotoUpload required />
                <input type="hidden" name="schoolId" value={selectedSchool?.id}/>
                <label><span>{text(locale, "班级", "Class")}</span><input name="classroomName" maxLength={100}/></label>
                <StudentWeekdays locale={locale}/>
                <label><span>{text(locale, "课外班", "After-school program")}</span><select name="programId" required defaultValue=""><option value="" disabled>{text(locale, "选择课外班", "Select program")}</option>{programs.map((program) => <option value={program.id} key={program.id}>{program.name}</option>)}</select></label>
                <label><span>{text(locale, "年级", "Grade")}</span><input name="grade" placeholder="3" required /></label>
                <label><span>{text(locale, "年龄", "Age")}</span><input name="age" type="number" min="3" max="20" required /></label>
                <label><span>{text(locale, "家长姓名", "Parent name")}</span><input name="parentName" required /></label>
                <label><span>{text(locale, "与学生关系", "Relationship")}</span><input name="relationship" placeholder={text(locale, "母亲", "Mother")} required /></label>
                <label><span>{text(locale, "家长电话", "Parent phone")}</span><input name="parentPhone" type="tel" required /></label>
                <label><span>{text(locale, "备用电话", "Backup phone")}</span><input name="backupPhone" type="tel" /></label>
                <label className="full"><span>{text(locale, "家长邮箱", "Parent email")}</span><input name="email" type="email" /></label>
                <label className="full"><span>{text(locale, "接送备注", "Pickup notes")}</span><textarea name="notes" rows={2} /></label>
              </ActionForm>
            ) : <p className="setup-callout">{text(locale, "请先在资料中设置学校和课外班。", "Configure a school and an after-school program in Resources first.")}</p>}
          </RosterCreateDialog>
        </div>
      </div>
      <div className="school-roster">
        <section className="content-section">
          <div className="section-heading"><div><span className="eyebrow">{selectedSchool?.name ?? text(locale, "在册学生", "Active roster")}</span><h2>{visibleStudents.length} {text(locale, "名学生", "students")}</h2></div></div>
          {visibleStudents.length ? (
            <div className="student-grid">
              {visibleStudents.map((student) => (
                <article className="student-card" key={student.id}>
                  <div className="student-card-photo">{student.photoUrl ? <Image unoptimized={student.photoUrl.startsWith("/api/photos/")} src={student.photoUrl} alt={text(locale, `${student.name} 的照片`, `${student.name} profile`)} fill sizes="96px" /> : <UsersRound size={48} aria-label={text(locale, "照片待补充", "Photo pending")} />}</div>
                  <div className="student-card-body">
                    <div className="student-card-heading">
                      <div className="student-card-identity"><h3>{student.name}</h3><p>{student.schoolName}</p></div>
                      <StudentRecordActions operatingTermId={operation.id} student={student} schools={schools} programs={programs} locale={locale} />
                    </div>
                    <div className="student-facts">
                      <span><GraduationCap size={14} /> {student.classroomName} · {text(locale, "年级", "Grade")} {student.grade || text(locale, "待定", "pending")}</span>
                      <span><UsersRound size={14} /> {text(locale, "年龄", "Age")} {student.age ?? text(locale, "待定", "pending")}</span>
                      {Boolean(student.noPickupWeekdays?.length) && <span>{text(locale,'每周不接送：','No pickup: ')}{student.noPickupWeekdays!.map(day=>(locale==='zh'?['周一','周二','周三','周四','周五','周六','周日']:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'])[day-1]).join(' / ')}</span>}
                      <span><Phone size={14} /> {student.parentName ? `${student.parentName} · ${student.parentPhone}` : text(locale, "家长联系方式待补充", "Parent contact pending")}</span>
                    </div>
                    <div className="destination"><span>{text(locale, "送达", "Dropoff")}</span><strong>{student.programName}</strong></div>
                  </div>
                </article>
              ))}
            </div>
          ) : <EmptyState title={text(locale, "暂无学生", "No students yet")} body={selectedSchool ? text(locale, "该学校还没有在册学生，可使用上方“添加学生”录入。", "This school has no students yet. Use Add student above to create one.") : text(locale, "请先在资料中添加学校。", "Add a school in Resources first.")} href="/resources?tab=schools" action={text(locale, "设置地点", "Set up locations")} />}
        </section>
      </div>
    </div>
  );
}
