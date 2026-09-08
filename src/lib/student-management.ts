import { attachPhoto, photoPath } from "@/lib/student-photos";
import type { PoolClient } from "pg";

export class StudentEditError extends Error {}

export function editableNote(notes: string): string {
  try {
    const parsed = JSON.parse(notes);
    if (parsed?.kind === "historical-test-data") return typeof parsed.note === "string" ? parsed.note : "";
  } catch { /* Ordinary notes are plain text. */ }
  return notes;
}

function mergeNote(previous: string, note: string) {
  try {
    const parsed = JSON.parse(previous);
    if (parsed?.kind === "historical-test-data") return JSON.stringify({ ...parsed, note });
  } catch { /* Keep ordinary notes as plain text. */ }
  return note;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function field(form: FormData, name: string, max = 500) {
  const value = form.get(name);
  if (typeof value !== "string" || value.length > max) throw new StudentEditError("invalid");
  return value.trim();
}

async function lockStudent(client: PoolClient, form: FormData) {
  const id = field(form, "id");
  const version = field(form, "updatedAt");
  if (!uuid.test(id) || !version || Number.isNaN(Date.parse(version))) throw new StudentEditError("invalid");
  const result = await client.query<{
    id: string; parent_id: string | null; school_id: string; program_id: string;
    notes: string; photo_url: string; fresh: boolean;
  }>(`select st.id, st.parent_id, st.program_id, st.notes, st.photo_url, c.school_id,
      st.updated_at=$2::timestamptz as fresh from students st join classrooms c on c.id=st.classroom_id
      where st.id=$1 and st.active for update of st`, [id, version]);
  if (!result.rowCount) throw new StudentEditError("missing");
  if (!result.rows[0].fresh) throw new StudentEditError("stale");
  return result.rows[0];
}

export async function saveStudent(client: PoolClient, form: FormData, actorId?: string) {
  const name = field(form, "name", 200);
  const classroomId = field(form, "classroomId");
  const programId = field(form, "programId");
  const grade = field(form, "grade", 30);
  const ageText = field(form, "age", 3);
  const age = ageText ? Number(ageText) : null;
  const note = field(form, "notes", 4000);
  const replacement = field(form, "photoUrl", 2048);
  const removePhoto = form.get("removePhoto") === "on";
  if (!name || !uuid.test(classroomId) || !uuid.test(programId)) throw new StudentEditError("invalid");
  if (age !== null && (!/^\d+$/.test(ageText) || !Number.isInteger(age) || age < 3 || age > 20)) throw new StudentEditError("age");
  if (replacement && !photoPath.test(replacement)) {
    try {
      const url = new URL(replacement);
      if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw new Error();
    } catch { throw new StudentEditError("photo"); }
  }
  if (replacement && removePhoto) throw new StudentEditError("photo");
  const parent = {
    name: field(form, "parentName", 200), relationship: field(form, "relationship", 80),
    phone: field(form, "parentPhone", 80), backup: field(form, "backupPhone", 80), email: field(form, "email", 254),
  };
  if (parent.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parent.email)) throw new StudentEditError("email");
  const current = await lockStudent(client, form);
  const classroom = await client.query<{ school_id: string }>("select school_id from classrooms where id=$1", [classroomId]);
  const program = await client.query("select id from after_school_programs where id=$1", [programId]);
  if (!classroom.rowCount || !program.rowCount) throw new StudentEditError("invalid");
  if (classroom.rows[0].school_id !== current.school_id || programId !== current.program_id) {
    const trips = await client.query(`select 1 from trip_students ts join trips t on t.id=ts.trip_id
      where ts.student_id=$1 and t.operating_term_id=current_operating_term() and t.status not in ('COMPLETED','CANCELED') limit 1`, [current.id]);
    if (trips.rowCount) throw new StudentEditError("assigned");
  }
  let parentId = current.parent_id;
  const values = [parent.name, parent.relationship, parent.phone, parent.backup || null, parent.email || null];
  if (parentId) {
    const previous = await client.query<{ name: string; relationship: string; phone: string; backup_phone: string | null; email: string | null }>(
      "select name,relationship,phone,backup_phone,email from parents where id=$1 for update", [parentId]);
    const row = previous.rows[0];
    if (JSON.stringify([row.name, row.relationship, row.phone, row.backup_phone, row.email]) !== JSON.stringify(values)) {
      const shared = await client.query("select 1 from students where parent_id=$1 and id<>$2 limit 1", [parentId, current.id]);
      if (shared.rowCount) parentId = null;
      else await client.query("update parents set name=$2,relationship=$3,phone=$4,backup_phone=$5,email=$6 where id=$1", [parentId, ...values]);
    }
  }
  if (!parentId && Object.values(parent).some(Boolean)) {
    const inserted = await client.query<{ id: string }>("insert into parents (name,relationship,phone,backup_phone,email) values ($1,$2,$3,$4,$5) returning id", values);
    parentId = inserted.rows[0].id;
  }
  if (replacement) {
    try { await attachPhoto(client,replacement,current.id,actorId); } catch { throw new StudentEditError("photo"); }
  }
  await client.query(`update students set name=$2,classroom_id=$3,program_id=$4,grade=$5,age=$6,
    photo_url=$7,parent_id=$8,notes=$9,updated_at=clock_timestamp() where id=$1`,
    [current.id, name, classroomId, programId, grade, age, removePhoto ? "" : replacement || current.photo_url, parentId, mergeNote(current.notes, note)]);
}

export async function archiveStudent(client: PoolClient, form: FormData) {
  const current = await lockStudent(client, form);
  await client.query("update students set active=false,updated_at=clock_timestamp() where id=$1", [current.id]);
}
