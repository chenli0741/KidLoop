"use client";
import { useActionState, useState } from "react";
import { ArrowRight } from "lucide-react";
import { login } from "@/app/login/actions";
import { useLocale } from "@/components/locale-provider";
import { text } from "@/lib/i18n";

export function LoginForm({ rememberedEmail = "" }: { rememberedEmail?: string }) {
  const [email, setEmail] = useState(rememberedEmail);
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const locale = useLocale();
  const [state, action, pending] = useActionState(login, { ok: false, message: "" });
  return <form action={action} id="login-form" autoComplete="on" className="form-grid login-form">
    <label className="full"><span>{text(locale, "邮箱", "Email")}</span><input id="login-email" type="email" name="email" autoComplete="username" autoCapitalize="none" spellCheck={false} value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={254} /></label>
    <label className="full"><span>{text(locale, "密码", "Password")}</span><input id="login-password" type="password" name="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required maxLength={128} /></label>
    <label className="login-remember full"><input type="checkbox" name="remember" checked={remember} onChange={(event) => setRemember(event.target.checked)} /><span>{text(locale, "记住登录 30 天", "Keep me signed in for 30 days")}</span></label>
    {state.message && <p className="form-message error full" role="alert">{state.message}</p>}
    <button className="button primary full" disabled={pending}>{text(locale, pending ? "登录中…" : "登录", pending ? "Signing in…" : "Sign in")}<ArrowRight size={18} /></button>
  </form>;
}
