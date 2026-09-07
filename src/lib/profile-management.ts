import "server-only";
import type { PoolClient } from "pg";
import { hashPassword, verifyPassword } from "@/lib/password";
import { saveStudent } from "@/lib/student-management";
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
  await client.query("update app_users set name=$2,email=$3,phone=$4,updated_at=clock_timestamp() where id=$1", [userId, name, email, phone]);
  if (current.role === "DRIVER" && current.driver_id) {
    await client.query("update drivers set name=$2,phone=$3,updated_at=clock_timestamp() where id=$1", [current.driver_id, name, phone]);
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

export async function saveOwnChild(client: PoolClient, user: AuthUser, form: FormData) {
  if (user.role !== "PARENT") throw new ProfileError("forbidden");
  const result = await client.query<{ classroom_id: string; program_id: string }>(`
    select st.classroom_id,st.program_id from students st
    where st.id=$1::uuid and st.active and exists (select 1 from user_students us where us.student_id=st.id and us.user_id=$2)
    for update of st
  `, [form.get("id"), user.id]);
  if (!result.rowCount) throw new ProfileError("forbidden");
  const allowed = new FormData();
  for (const key of ["id", "updatedAt", "name", "grade", "age", "notes", "photoUrl", "removePhoto", "parentName", "relationship", "parentPhone", "backupPhone", "email"]) {
    const field = form.get(key);
    if (typeof field === "string") allowed.set(key, field);
  }
  // Association changes are an administrator operation, never trusted from a parent's request.
  allowed.set("classroomId", result.rows[0].classroom_id);
  allowed.set("programId", result.rows[0].program_id);
  await saveStudent(client, allowed, user.id);
}
