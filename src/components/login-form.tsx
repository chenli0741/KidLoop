"use client";
import { useActionState } from "react";
import { ArrowRight } from "lucide-react";
import { login } from "@/app/login/actions";
import { useLocale } from "@/components/locale-provider";
import { text } from "@/lib/i18n";

export function LoginForm() {
  const locale = useLocale();
  const [state, action, pending] = useActionState(login, { ok: false, message: "" });
  return <form action={action} className="form-grid login-form">
    <label className="full"><span>{text(locale, "邮箱", "Email")}</span><input type="email" name="email" autoComplete="username" required maxLength={254} /></label>
    <label className="full"><span>{text(locale, "密码", "Password")}</span><input type="password" name="password" autoComplete="current-password" required maxLength={128} /></label>
    {state.message && <p className="form-message error full" role="alert">{state.message}</p>}
    <button className="button primary full" disabled={pending}>{text(locale, pending ? "登录中…" : "登录", pending ? "Signing in…" : "Sign in")}<ArrowRight size={18} /></button>
  </form>;
}
