"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { identityQuery } from "@/lib/identity-db";
import { hashPassword, tokenHash } from "@/lib/password";
import { getLocale } from "@/lib/i18n-server";
import { text } from "@/lib/i18n";
import type { FormState } from "@/lib/types";
export async function register(_: FormState, form: FormData): Promise<FormState> {
  const locale = await getLocale();
  const name = String(form.get("name") ?? "").trim(), email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!name || name.length>100 || email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length<6 || password.length>128 || password!==form.get("confirmPassword")) {
    return {ok:false,message:text(locale,"请填写姓名、有效邮箱及两次一致的密码（6–128 字符）。","Enter your name, a valid email and matching passwords (6–128 characters).")};
  }
  const ip = (await headers()).get("x-forwarded-for")?.split(',')[0]?.trim() ?? "unknown";
  const limit = (await identityQuery<{attempts:number}>(`insert into login_limits(key_hash) values($1) on conflict(key_hash) do update set
    attempts=case when login_limits.window_start<now()-interval '1 hour' then 1 else login_limits.attempts+1 end,
    window_start=case when login_limits.window_start<now()-interval '1 hour' then now() else login_limits.window_start end returning attempts`,[tokenHash(`register:${ip}`)])).rows[0];
  if (limit.attempts>20) return {ok:false,message:text(locale,"注册尝试过多，请稍后重试。","Too many registration attempts. Try again later.")};
  try {
    await identityQuery("insert into login_accounts(email,name,password_hash) values($1,$2,$3)",[email,name,await hashPassword(password)]);
  } catch { return {ok:false,message:text(locale,"无法注册，此邮箱可能已注册。请登录或检查输入。","Unable to register. This email may already be registered. Sign in or check your details.")}; }
  redirect("/login?registered=1");
}
