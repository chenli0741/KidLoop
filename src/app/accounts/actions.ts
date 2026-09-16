"use server";
import { AccountEditError, saveAccount } from "@/lib/account-management";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { transaction } from "@/lib/db";
import { identityTransaction } from "@/lib/identity-db";
import { bindAccount } from "@/lib/tenant-service";
import { getLocale } from "@/lib/i18n-server";
import { text } from "@/lib/i18n";
import type { FormState } from "@/lib/types";

export async function createAccount(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireUser(["ADMIN"], true), locale = await getLocale();
  try {
    await identityTransaction(c => bindAccount(c,admin.id,{
      email:String(form.get("email") ?? ""),role:String(form.get("role") ?? ""),
      driverId:String(form.get("driverId") ?? "") || null,studentIds:form.getAll("studentIds").map(String),
      requestId:String(form.get("requestId") ?? "") || undefined,
    }));
    revalidatePath("/admin/accounts"); revalidatePath("/organizations");
    return {ok:true,message:text(locale,"账号已绑定到本机构。","Account bound to this institution.")};
  } catch {
    return {ok:false,message:text(locale,"绑定失败。请确认用户已注册、尚未绑定本机构，并选择本机构的司机或孩子。","Could not bind. Check that the account is registered, not already bound, and its driver or children belong to this institution.")};
  }
}

export async function setAccountActive(form: FormData) {
  const admin = await requireUser(["ADMIN"], true);
  const id = String(form.get("userId") ?? "");
  if (id === admin.id) return;
  await transaction(async (client) => {
    await client.query("update app_users set active = $2 where id = $1::uuid", [id, form.get("active") === "true"]);
    await client.query("delete from user_sessions where user_id = $1::uuid", [id]);
  });
  revalidatePath("/admin/accounts");
}

export async function updateChildLinks(_: FormState, form: FormData): Promise<FormState> {
  await requireUser(["ADMIN"], true);
  const locale = await getLocale();
  try {
    const userId = String(form.get("userId") ?? "");
    const studentIds = [...new Set(form.getAll("studentIds").map(String))];
    await transaction(async (client) => {
      const user = await client.query("select id from app_users where id = $1::uuid and role = 'PARENT' for update", [userId]);
      if (!user.rowCount) throw new Error("NOT_FOUND");
      await client.query("update app_users set updated_at=clock_timestamp() where id=$1",[userId]);
      await client.query("delete from user_students where user_id = $1", [userId]);
      for (const id of studentIds) await client.query("insert into user_students (user_id, student_id) values ($1, $2::uuid)", [userId, id]);
    });
    revalidatePath("/admin/accounts"); revalidatePath("/parent");
    return { ok: true, message: text(locale, "孩子绑定已更新。", "Child links updated.") };
  } catch {
    return { ok: false, message: text(locale, "无法更新绑定，请重试。", "Could not update child links. Please retry.") };
  }
}

export async function updateAccount(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireUser(["ADMIN"], true), locale = await getLocale();
  try {
    await transaction(c => saveAccount(c, admin, form));
    revalidatePath("/", "layout");
    return {ok:true,message:text(locale,"账号资料已保存。","Account information saved.")};
  } catch (error) {
    const messages: Record<string,[string,string]> = {
      stale:["账号已更新，请刷新后重新编辑。","Account changed. Refresh before editing."],
      selfRole:["不能更改当前登录管理员的角色。","You cannot change your own administrator role."],
      missing:["账号不存在，请刷新页面。","Account unavailable. Refresh the page."],
    };
    const message = error instanceof AccountEditError ? messages[error.message] : undefined;
    return {ok:false,message:message?text(locale,...message):text(locale,"保存失败，请检查邮箱或司机是否重复，以及关联资料是否有效。","Could not save. Check for duplicate email or driver and valid linked records.")};
  }
}
