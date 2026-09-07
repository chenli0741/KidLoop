"use server";

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { query } from "@/lib/db";
import { hashPassword, tokenHash, verifyPassword } from "@/lib/password";
import { homeFor, SESSION_COOKIE, SESSION_SECONDS } from "@/lib/auth";
import { getLocale } from "@/lib/i18n-server";
import { text } from "@/lib/i18n";
import type { FormState, UserRole } from "@/lib/types";

// Unknown accounts perform the same password work as known accounts.
const dummyHash = hashPassword(randomBytes(32).toString("hex"));

export async function login(_: FormState, form: FormData): Promise<FormState> {
  const locale = await getLocale();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const fail = { ok: false, message: text(locale, "邮箱或密码不正确，或尝试次数过多，请稍后重试。", "Invalid credentials or too many attempts. Please try again later.") };
  if (!email || email.length > 254 || !password || password.length > 128) return fail;
  const limit = await query<{ attempts: number }>(`
    insert into login_limits (key_hash) values ($1)
    on conflict (key_hash) do update set
      attempts = case when login_limits.window_start < now() - interval '15 minutes' then 1 else login_limits.attempts + 1 end,
      window_start = case when login_limits.window_start < now() - interval '15 minutes' then now() else login_limits.window_start end
    returning attempts
  `, [tokenHash(email)]);
  if (limit.rows[0].attempts > 10) return fail;
  const result = await query<{ id: string; role: UserRole; password_hash: string; active: boolean }>(
    "select id, role, password_hash, active from app_users where email = $1", [email],
  );
  const user = result.rows[0];
  const valid = await verifyPassword(password, user?.password_hash ?? await dummyHash);
  if (!valid || !user?.active) return fail;
  const token = randomBytes(32).toString("hex");
  await query("insert into user_sessions (token_hash, user_id, expires_at) values ($1, $2, now() + interval '7 days')", [tokenHash(token), user.id]);
  const jar = await cookies();
  const old = jar.get(SESSION_COOKIE)?.value;
  if (old) await query("delete from user_sessions where token_hash = $1", [tokenHash(old)]);
  jar.set(SESSION_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_SECONDS });
  await query("delete from login_limits where key_hash = $1", [tokenHash(email)]);
  redirect(homeFor(user.role));
}

export async function logout() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await query("delete from user_sessions where token_hash = $1", [tokenHash(token)]);
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}
