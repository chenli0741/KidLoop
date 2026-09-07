"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { transaction } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { getLocale } from "@/lib/i18n-server";
import { text } from "@/lib/i18n";
import type { FormState } from "@/lib/types";

export async function createAccount(_: FormState, form: FormData): Promise<FormState> {
  await requireUser(["ADMIN"]);
  const locale = await getLocale();
  try {
    const name = String(form.get("name") ?? "").trim();
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const role = String(form.get("role") ?? "");
    const driverId = String(form.get("driverId") ?? "") || null;
    const studentIds = [...new Set(form.getAll("studentIds").map(String))];
    if (!name || name.length > 100 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !["ADMIN", "DRIVER", "PARENT"].includes(role)) throw new Error("INVALID");
    if (role === "DRIVER" && !driverId) throw new Error("INVALID");
    if (role === "PARENT" && studentIds.length === 0) throw new Error("INVALID");
    const passwordHash = await hashPassword(String(form.get("password") ?? ""));
    await transaction(async (client) => {
      const result = await client.query<{ id: string }>("insert into app_users (name, email, role, password_hash, driver_id) values ($1, $2, $3, $4, $5) returning id", [name, email, role, passwordHash, role === "DRIVER" ? driverId : null]);
      if (role === "PARENT") {
        for (const id of studentIds) await client.query("insert into user_students (user_id, student_id) values ($1, $2::uuid)", [result.rows[0].id, id]);
      }
    });
    revalidatePath("/admin/accounts");
    return { ok: true, message: text(locale, "账号已创建。请将登录信息交给对应用户。", "Account created. Share the login details with the user.") };
  } catch {
    return { ok: false, message: text(locale, "创建失败。邮箱和司机不能重复，密码需 12–128 个字符，家长需绑定孩子，司机需绑定司机资料。", "Could not create account. Email and driver must be unique, password must have 12–128 characters, and the required child or driver link must be selected.") };
  }
}

export async function resetAccountPassword(_: FormState, form: FormData): Promise<FormState> {
  await requireUser(["ADMIN"]);
  const locale = await getLocale();
  try {
    const passwordHash = await hashPassword(String(form.get("password") ?? ""));
    await transaction(async (client) => {
      const user = await client.query("update app_users set password_hash = $2 where id = $1::uuid returning id", [form.get("userId"), passwordHash]);
      if (!user.rowCount) throw new Error("NOT_FOUND");
      await client.query("delete from user_sessions where user_id = $1::uuid", [form.get("userId")]);
    });
    return { ok: true, message: text(locale, "密码已重置，该账号需重新登录。", "Password reset. This account must sign in again.") };
  } catch {
    return { ok: false, message: text(locale, "无法重置密码，请输入 12–128 个字符。", "Could not reset password. Use 12–128 characters.") };
  }
}

export async function setAccountActive(form: FormData) {
  const admin = await requireUser(["ADMIN"]);
  const id = String(form.get("userId") ?? "");
  if (id === admin.id) return;
  await transaction(async (client) => {
    await client.query("update app_users set active = $2 where id = $1::uuid", [id, form.get("active") === "true"]);
    await client.query("delete from user_sessions where user_id = $1::uuid", [id]);
  });
  revalidatePath("/admin/accounts");
}

export async function updateChildLinks(_: FormState, form: FormData): Promise<FormState> {
  await requireUser(["ADMIN"]);
  const locale = await getLocale();
  try {
    const userId = String(form.get("userId") ?? "");
    const studentIds = [...new Set(form.getAll("studentIds").map(String))];
    await transaction(async (client) => {
      const user = await client.query("select id from app_users where id = $1::uuid and role = 'PARENT' for update", [userId]);
      if (!user.rowCount) throw new Error("NOT_FOUND");
      await client.query("delete from user_students where user_id = $1", [userId]);
      for (const id of studentIds) await client.query("insert into user_students (user_id, student_id) values ($1, $2::uuid)", [userId, id]);
    });
    revalidatePath("/admin/accounts"); revalidatePath("/parent");
    return { ok: true, message: text(locale, "孩子绑定已更新。", "Child links updated.") };
  } catch {
    return { ok: false, message: text(locale, "无法更新绑定，请重试。", "Could not update child links. Please retry.") };
  }
}
