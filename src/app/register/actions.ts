"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { registerCompany } from "@/lib/company-registration";
import { identityTransaction } from "@/lib/identity-db";
import { getIdentity } from "@/lib/identity";
import { identityQuery } from "@/lib/identity-db";
import { hashPassword, tokenHash } from "@/lib/password";
import { getLocale } from "@/lib/i18n-server";
import { text } from "@/lib/i18n";
import type { FormState } from "@/lib/types";
export async function register(_: FormState, form: FormData): Promise<FormState> {
  const locale = await getLocale();
  const name = String(form.get("name") ?? "").trim(), email = String(form.get("email") ?? "").trim().toLowerCase();
  if (await getIdentity()) return {ok:false,message:text(locale,"请先退出当前账号。","Sign out of your current account first.")};
  const companyName=String(form.get("companyName")??"").trim(),phone=String(form.get("phone")??"").trim(),address=String(form.get("address")??"").trim();
  const password = String(form.get("password") ?? "");
  if (!companyName || companyName.length>100 || !phone || phone.length>80 || !address || address.length>500 || !name || name.length>100 || email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length<6 || password.length>128 || password!==form.get("confirmPassword")) {
    return {ok:false,message:text(locale,"请完整填写负责人、公司资料及两次一致的密码（6–128 字符）。","Complete the account and company details, with matching passwords (6–128 characters).")};
  }
  const ip = (await headers()).get("x-forwarded-for")?.split(',')[0]?.trim() ?? "unknown";
  const limit = (await identityQuery<{attempts:number}>(`insert into login_limits(key_hash) values($1) on conflict(key_hash) do update set
    attempts=case when login_limits.window_start<now()-interval '1 hour' then 1 else login_limits.attempts+1 end,
    window_start=case when login_limits.window_start<now()-interval '1 hour' then now() else login_limits.window_start end returning attempts`,[tokenHash(`register:${ip}`)])).rows[0];
  if (limit.attempts>20) return {ok:false,message:text(locale,"注册尝试过多，请稍后重试。","Too many registration attempts. Try again later.")};
  try {
    const passwordHash=await hashPassword(password);
    await identityTransaction(c=>registerCompany(c,{name,email,passwordHash,companyName,phone,address}));
  } catch { return {ok:false,message:text(locale,"无法注册，此邮箱可能已注册。请登录或检查输入。","Unable to register. This email may already be registered. Sign in or check your details.")}; }
  redirect("/login?registered=1");
}
