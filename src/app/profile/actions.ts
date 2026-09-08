"use server";
import { requireTerm, TermError } from "@/lib/operating-terms";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser, SESSION_COOKIE } from "@/lib/auth";
import { query, transaction } from "@/lib/db";
import { tokenHash } from "@/lib/password";
import { LOGIN_EMAIL_COOKIE, LOGIN_EMAIL_SECONDS } from "@/lib/login-preferences";
import { saveOwnProfile, changeOwnPassword, saveOwnChild } from "@/lib/profile-management";
import { getLocale } from "@/lib/i18n-server";
import { text, type Locale } from "@/lib/i18n";
import type { FormState } from "@/lib/types";

function failure(error: unknown, locale: Locale): FormState {
  if(error instanceof TermError)return {ok:false,message:error.message};
  const messages: Record<string, [string, string]> = {
    password: ["当前密码不正确。", "The current password is incorrect."],
    newPassword: ["新密码需 12–128 个字符，且两次输入一致。", "Use 12–128 characters and matching new passwords."],
    stale: ["资料已更新，请刷新后重新编辑。", "Details changed. Refresh before editing again."],
    limited: ["尝试次数过多，请 15 分钟后再试。", "Too many attempts. Try again in 15 minutes."],
    forbidden: ["你只能修改自己的账号和已绑定孩子的资料。", "You can only edit your own account and linked children."],
    age: ["年龄须为 3–20 的整数，也可留空。", "Age must be an integer from 3 to 20 or left empty."],
    photo: ["请输入有效照片链接，或勾选移除照片。", "Enter a valid photo URL or select remove photo."],
  };
  const message = error instanceof Error ? messages[error.message] : undefined;
  return { ok: false, message: message ? text(locale, ...message) : text(locale, "保存失败，请检查资料及邮箱是否已被使用。", "Could not save. Check the details and whether the email is already in use.") };
}
async function passwordAttempt(id: string) {
  const result = await query<{ attempts: number }>(`insert into login_limits(key_hash) values($1)
    on conflict(key_hash) do update set
      attempts=case when login_limits.window_start<now()-interval '15 minutes' then 1 else login_limits.attempts+1 end,
      window_start=case when login_limits.window_start<now()-interval '15 minutes' then now() else login_limits.window_start end
    returning attempts`, [tokenHash(`profile:${id}`)]);
  if (result.rows[0].attempts > 10) throw new Error("limited");
}

export async function updateProfile(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser(); const locale = await getLocale();
  try {
    if (String(form.get("email") ?? "").trim().toLowerCase() !== user.email) await passwordAttempt(user.id);
    const saved = await transaction((client) => saveOwnProfile(client, user.id, form));
    const jar = await cookies();
    if (saved.emailChanged && jar.has(LOGIN_EMAIL_COOKIE)) jar.set(LOGIN_EMAIL_COOKIE, encodeURIComponent(saved.email), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: LOGIN_EMAIL_SECONDS });
    revalidatePath("/", "layout");
    return { ok: true, message: text(locale, "个人资料已保存。", "Profile saved.") };
  } catch (error) { return failure(error, locale); }
}

export async function updatePassword(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser(); const locale = await getLocale();
  try {
    await passwordAttempt(user.id);
    await transaction((client) => changeOwnPassword(client, user.id, form));
  } catch (error) { return failure(error, locale); }
  (await cookies()).delete(SESSION_COOKIE);
  revalidatePath("/", "layout");
  redirect("/login?passwordChanged=1");
}

export async function updateChild(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser(["PARENT"]); const locale = await getLocale();
  try {
    await transaction(async client => {
      const term=await requireTerm(client,String(form.get('operatingTermId')));
      if(!(await client.query('select 1 from term_students where operating_term_id=$1 and student_id=$2',[term.id,String(form.get('id'))])).rowCount)throw new Error('forbidden');
      await saveOwnChild(client,user,form);
    });
    for (const path of ["/parent", "/parent/children", "/students", "/driver", "/routes", "/schedule", "/schedule/dispatch", "/"]) revalidatePath(path);
    return { ok: true, message: text(locale, "孩子资料已保存。", "Child information saved.") };
  } catch (error) { return failure(error, locale); }
}
