import Image from "next/image";
import Link from "next/link";
import { ArrowRight, GraduationCap, Phone, School, UserPlus, UsersRound } from "lucide-react";
import { createClassroom, createStudent } from "@/app/actions";
import { ActionForm } from "@/components/action-form";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { getClassrooms, getPrograms, getSchools, getStudents } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function StudentsPage() {
  const [students, classrooms, schools, programs] = await Promise.all([
    getStudents(), getClassrooms(), getSchools(), getPrograms(),
  ]);
  const canAddStudent = classrooms.length > 0 && programs.length > 0;

  return (
    <div className="page-container">
      <PageHeader eyebrow="Roster" title="Students" description="Keep each student’s pickup identity, class, destination, and parent contact together." />

      <div className="students-layout">
        <section className="content-section">
          <div className="section-heading"><div><span className="eyebrow">Active roster</span><h2>{students.length} students</h2></div></div>
          {students.length ? (
            <div className="student-grid">
              {students.map((student) => (
                <article className="student-card" key={student.id}>
                  <div className="student-card-photo"><Image src={student.photoUrl} alt={`${student.name} profile`} fill sizes="96px" /></div>
                  <div className="student-card-body">
                    <h3>{student.name}</h3>
                    <p>{student.schoolName}</p>
                    <div className="student-facts">
                      <span><GraduationCap size={14} /> {student.classroomName} · Grade {student.grade}</span>
                      <span><UsersRound size={14} /> Age {student.age}</span>
                      <span><Phone size={14} /> {student.parentName} · {student.parentPhone}</span>
                    </div>
                    <div className="destination"><span>Dropoff</span><strong>{student.programName}</strong></div>
                  </div>
                </article>
              ))}
            </div>
          ) : <EmptyState title="No students yet" body="Add a school, class, and after-school program before creating the first student." href="/locations" action="Set up locations" />}
        </section>

        <div className="form-stack">
          <aside className="form-panel">
            <div className="panel-heading"><School size={19} /><div><h2>Add class</h2><p>Simple school grouping</p></div></div>
            {schools.length ? (
              <ActionForm action={createClassroom} submitLabel="Add class">
                <label className="full"><span>School</span><select name="schoolId" required defaultValue=""><option value="" disabled>Select school</option>{schools.map((school) => <option value={school.id} key={school.id}>{school.name}</option>)}</select></label>
                <label className="full"><span>Class name</span><input name="name" placeholder="Room 12" required /></label>
              </ActionForm>
            ) : <p className="setup-callout">Add a school first. <Link href="/locations">Open locations <ArrowRight size={14} /></Link></p>}
          </aside>

          <aside className="form-panel">
            <div className="panel-heading"><UserPlus size={19} /><div><h2>Add student</h2><p>Pickup identity and parent</p></div></div>
            {canAddStudent ? (
              <ActionForm action={createStudent} submitLabel="Add student">
                <label><span>Student name</span><input name="name" required /></label>
                <label><span>Photo URL</span><input name="photoUrl" type="url" placeholder="https://..." required /></label>
                <label><span>Class</span><select name="classroomId" required defaultValue=""><option value="" disabled>Select class</option>{classrooms.map((classroom) => <option value={classroom.id} key={classroom.id}>{classroom.schoolName} · {classroom.name}</option>)}</select></label>
                <label><span>After-school program</span><select name="programId" required defaultValue=""><option value="" disabled>Select program</option>{programs.map((program) => <option value={program.id} key={program.id}>{program.name}</option>)}</select></label>
                <label><span>Grade</span><input name="grade" placeholder="3" required /></label>
                <label><span>Age</span><input name="age" type="number" min="3" max="20" required /></label>
                <label><span>Parent name</span><input name="parentName" required /></label>
                <label><span>Relationship</span><input name="relationship" placeholder="Mother" required /></label>
                <label><span>Parent phone</span><input name="parentPhone" type="tel" required /></label>
                <label><span>Backup phone</span><input name="backupPhone" type="tel" /></label>
                <label className="full"><span>Parent email</span><input name="email" type="email" /></label>
                <label className="full"><span>Pickup notes</span><textarea name="notes" rows={2} /></label>
              </ActionForm>
            ) : <p className="setup-callout">A class and after-school program are required before adding students.</p>}
          </aside>
        </div>
      </div>
    </div>
  );
}
