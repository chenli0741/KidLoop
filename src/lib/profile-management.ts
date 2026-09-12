import "server-only";
import type { PoolClient } from "pg";
import { photoPath } from "@/lib/student-photos";
import { hashPassword, verifyPassword } from "@/lib/password";
import { editableNote, mergeEditableNote, saveStudent } from "@/lib/student-management";
import type { AuthUser } from "@/lib/types";

export class ProfileError extends Error {}
function value(form: FormData, key: string, max: number) {
  const field = form.get(key);
  if (typeof field !== "string" || field.length > max) throw new ProfileError("invalid");
  return field.trim();
}

export async function saveOwnProfile(client: PoolClient, userId: string, form: FormData) {
  const name = value(form, "name", 100), email = value(form, "email", 254).toLowerCase(), phone = value(form, "phone", 80);
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ProfileError("invalid");
  const result = await client.query<{ email: string; password_hash: string; role: string; driver_id: string | null; fresh: boolean }>(
    "select email,password_hash,role,driver_id,updated_at=$2::timestamptz as fresh from app_users where id=$1 and active for update", [userId, form.get("updatedAt")]);
  const current = result.rows[0];
  if (!current) throw new ProfileError("forbidden");
  if (!current.fresh) throw new ProfileError("stale");
  const emailChanged = email !== current.email;
  if (emailChanged && !await verifyPassword(String(form.get("currentPassword") ?? ""), current.password_hash)) throw new ProfileError("password");
  await client.query("update app_users set name=$2,email=$3,phone=$4,updated_at=clock_timestamp() where id=$1", [userId, current.role === "DRIVER" ? null : name, email, current.role === "DRIVER" ? null : phone]);
  if (current.role === "DRIVER" && current.driver_id) {
    await client.query("update drivers set name=$2,phone=$3,updated_at=clock_timestamp() where id=$1", [current.driver_id, name, phone]);
  }
  const photo = String(form.get("photoUrl") ?? "").trim();
  const remove = form.get("removePhoto") === "on";
  if (photo && !remove) {
    const match = photoPath.exec(photo);
    if (!match || !(await client.query("select id from student_photos where id=$1 and uploaded_by=$2 and purpose='avatar' and student_id is null", [match[1],userId])).rowCount) throw new ProfileError("photo");
  }
  if (photo || remove) {
    if (current.role === "DRIVER") await client.query("update drivers set photo_url=$2,updated_at=clock_timestamp() where id=$1", [current.driver_id,remove ? "" : photo]);
    else await client.query("update app_users set photo_url=$2 where id=$1", [userId,remove ? "" : photo]);
  }
  return { email, emailChanged };
}

export async function changeOwnPassword(client: PoolClient, userId: string, form: FormData) {
  const password = form.get("newPassword"), confirm = form.get("confirmPassword");
  if (typeof password !== "string" || password.length < 12 || password.length > 128 || password !== confirm) throw new ProfileError("newPassword");
  const result = await client.query<{ password_hash: string }>("select password_hash from app_users where id=$1 and active for update", [userId]);
  if (!result.rowCount || !await verifyPassword(String(form.get("currentPassword") ?? ""), result.rows[0].password_hash)) throw new ProfileError("password");
  await client.query("update app_users set password_hash=$2,updated_at=clock_timestamp() where id=$1", [userId, await hashPassword(password)]);
  await client.query("delete from user_sessions where user_id=$1", [userId]);
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function saveOwnFamilyDetails(client: PoolClient, user: AuthUser, form: FormData) {
  if (user.role !== "PARENT") throw new ProfileError("forbidden");
  const parent = {
    name: value(form, "parentName", 200),
    relationship: value(form, "relationship", 80),
    phone: value(form, "parentPhone", 80),
    backup: value(form, "backupPhone", 80),
    email: value(form, "email", 254),
  };
  const note = value(form, "notes", 4000);
  if (parent.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parent.email)) throw new ProfileError("invalid");

  const expected = new Map<string, string>();
  for (const item of form.getAll("childVersion")) {
    if (typeof item !== "string") throw new ProfileError("invalid");
    const separator = item.indexOf("|");
    const id = item.slice(0, separator), updatedAt = item.slice(separator + 1);
    if (separator < 0 || !uuid.test(id) || !updatedAt || Number.isNaN(Date.parse(updatedAt)) || expected.has(id)) throw new ProfileError("invalid");
    expected.set(id, updatedAt);
  }

  const children = await client.query<{ id: string; parentId: string | null; notes: string; updatedAt: string }>(`
    select st.id,st.parent_id as "parentId",st.notes,st.updated_at::text as "updatedAt"
    from user_students us join students st on st.id=us.student_id
    where us.user_id=$1 and st.active
      and exists(select 1 from term_students et where et.student_id=st.id and et.operating_term_id=current_operating_term())
    order by st.id for update of st
  `, [user.id]);
  if (!children.rowCount) throw new ProfileError("forbidden");
  if (children.rowCount !== expected.size || children.rows.some(child => expected.get(child.id) !== child.updatedAt)) throw new ProfileError("stale");

  const hasParentDetails = Object.values(parent).some(Boolean);
  const currentParentIds = [...new Set(children.rows.map(child => child.parentId).filter((id): id is string => Boolean(id)))];
  let parentId: string | null = null;
  if (hasParentDetails && currentParentIds.length === 1) {
    const sharedOutsideFamily = await client.query("select 1 from students where parent_id=$1 and not (id=any($2::uuid[])) limit 1", [currentParentIds[0], children.rows.map(child => child.id)]);
    if (!sharedOutsideFamily.rowCount) {
      parentId = currentParentIds[0];
      await client.query("update parents set name=$2,relationship=$3,phone=$4,backup_phone=$5,email=$6 where id=$1", [parentId, parent.name, parent.relationship, parent.phone, parent.backup || null, parent.email || null]);
    }
  }
  if (hasParentDetails && !parentId) {
    const inserted = await client.query<{ id: string }>("insert into parents (name,relationship,phone,backup_phone,email) values ($1,$2,$3,$4,$5) returning id", [parent.name, parent.relationship, parent.phone, parent.backup || null, parent.email || null]);
    parentId = inserted.rows[0].id;
  }
  for (const child of children.rows) {
    await client.query("update students set parent_id=$2,notes=$3,updated_at=clock_timestamp() where id=$1", [child.id, parentId, mergeEditableNote(child.notes, note)]);
  }
}

export async function saveOwnChild(client: PoolClient, user: AuthUser, form: FormData) {
  if (user.role !== "PARENT") throw new ProfileError("forbidden");
  const result = await client.query<{ school_id: string; classroom_name: string; no_pickup_weekdays: number[]; program_id: string; notes: string; parent_name: string; relationship: string; parent_phone: string; backup_phone: string; email: string }>(`
    select st.school_id,st.classroom_name,st.no_pickup_weekdays,st.program_id,st.notes,
      coalesce(pa.name,'') as parent_name,coalesce(pa.relationship,'') as relationship,
      coalesce(pa.phone,'') as parent_phone,coalesce(pa.backup_phone,'') as backup_phone,coalesce(pa.email,'') as email
    from students st left join parents pa on pa.id=st.parent_id
    where st.id=$1::uuid and st.active and exists (select 1 from user_students us where us.student_id=st.id and us.user_id=$2)
    for update of st
  `, [form.get("id"), user.id]);
  if (!result.rowCount) throw new ProfileError("forbidden");
  const allowed = new FormData();
  for (const key of ["id", "updatedAt", "name", "grade", "age", "photoUrl", "removePhoto"]) {
    const field = form.get(key);
    if (typeof field === "string") allowed.set(key, field);
  }
  // Association changes are an administrator operation, never trusted from a parent's request.
  allowed.set("schoolId", result.rows[0].school_id);
  allowed.set("classroomName", result.rows[0].classroom_name);
  for (const day of result.rows[0].no_pickup_weekdays) allowed.append('noPickupWeekdays',String(day));
  allowed.set("programId", result.rows[0].program_id);
  allowed.set("notes", editableNote(result.rows[0].notes));
  allowed.set("parentName", result.rows[0].parent_name);
  allowed.set("relationship", result.rows[0].relationship);
  allowed.set("parentPhone", result.rows[0].parent_phone);
  allowed.set("backupPhone", result.rows[0].backup_phone);
  allowed.set("email", result.rows[0].email);
  await saveStudent(client, allowed, user.id);
}
