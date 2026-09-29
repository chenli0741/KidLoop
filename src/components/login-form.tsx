"use client";
import { useActionState, useEffect, useState } from "react";
import { ArrowRight, ChevronDown } from "lucide-react";
import { login, type LoginState } from "@/app/login/actions";
import { useLocale } from "@/components/locale-provider";
import { text } from "@/lib/i18n";
import { isSavedLoginShell, listSavedLogins, removeSavedLogin, saveLogin, supportsSavedLogins, type SavedLogin } from "@/lib/native-credentials";

let pendingSavedLogin: { account: SavedLogin; previous: SavedLogin | null } | null = null;

export function LoginForm({ rememberedEmail = "", invitation = "" }: { rememberedEmail?: string; invitation?: string }) {
  const [email, setEmail] = useState(rememberedEmail);
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [savedLogins, setSavedLogins] = useState<SavedLogin[]>([]);
  const [selectedEmail, setSelectedEmail] = useState("");
  const [savedLoginMenuOpen, setSavedLoginMenuOpen] = useState(false);
  const [nativeAccountPicker, setNativeAccountPicker] = useState(false);
  const locale = useLocale();
  const initialState: LoginState = { ok: false, message: "" };
  const [state, action, pending] = useActionState(login, initialState);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // The native scripts and the remotely hosted React page can finish in
      // either order. Wait briefly for the bridge instead of deciding once at
      // hydration time that this is a browser forever.
      for (let attempt = 0; attempt < 30 && !cancelled; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, attempt === 0 ? 0 : 100));
        if (isSavedLoginShell()) setNativeAccountPicker(true);
        if (!supportsSavedLogins()) continue;
        try {
          const accounts = await listSavedLogins();
          if (cancelled) return;
          setSavedLogins(accounts);
          const selected = accounts.find((account) => account.email === rememberedEmail) ?? accounts[0];
          if (selected) {
            setSelectedEmail(selected.email);
            setEmail(selected.email);
            setPassword(selected.password);
          }
          return;
        } catch (error) {
          console.error("KidLoop could not read saved accounts", error);
          return;
        }
      }
    })();
    return () => { cancelled = true; };
  }, [rememberedEmail]);

  useEffect(() => {
    if (!state.message || !pendingSavedLogin) return;
    const failed = pendingSavedLogin;
    pendingSavedLogin = null;
    void (failed.previous ? saveLogin(failed.previous) : removeSavedLogin(failed.account.email)).catch((error) => console.error("KidLoop could not restore the saved login", error));
  }, [state.message]);

  function selectAccount(value: string) {
    setSavedLoginMenuOpen(false);
    setSelectedEmail(value);
    const account = savedLogins.find((item) => item.email === value);
    if (account) {
      setEmail(account.email);
      setPassword(account.password);
    } else {
      setEmail("");
      setPassword("");
    }
  }

  return <form action={async (formData) => {
    const accountEmail = String(formData.get("email") ?? "").trim().toLowerCase();
    const accountPassword = String(formData.get("password") ?? "");
    if (formData.get("remember") === "on" && isSavedLoginShell() && accountEmail && accountPassword) {
      try {
        const saved = await listSavedLogins();
        const account = { email: accountEmail, password: accountPassword };
        pendingSavedLogin = { account, previous: saved.find((entry) => entry.email === accountEmail) ?? null };
        await saveLogin(account);
      } catch (error) {
        pendingSavedLogin = null;
        console.error("KidLoop could not save this login", error);
      }
    } else {
      pendingSavedLogin = null;
    }
    action(formData);
  }} id="login-form" autoComplete="on" className="form-grid login-form">
    <input type="hidden" name="invitation" value={invitation}/>
    <label className="full"><span>{text(locale, "邮箱", "Email")}</span><div className="login-email-field"><input id="login-email" type="email" name="email" autoComplete="username" autoCapitalize="none" spellCheck={false} value={email} onFocus={() => setSavedLoginMenuOpen(false)} onChange={(event) => { const value=event.target.value; setEmail(value); if(value.trim().toLowerCase()!==selectedEmail)setSelectedEmail(""); }} required maxLength={254} />{savedLogins.length > 0 && <><button type="button" className="saved-login-toggle" aria-label={text(locale,"选择已保存登录","Choose saved login")} aria-expanded={savedLoginMenuOpen} onClick={() => setSavedLoginMenuOpen((open) => !open)}><ChevronDown size={20}/></button>{savedLoginMenuOpen && <div className="saved-login-options">{savedLogins.map((account) => <button type="button" key={account.email} className={account.email === selectedEmail ? "selected" : ""} onClick={() => selectAccount(account.email)}>{account.email}</button>)}</div>}</>}</div></label>
    <label className="full"><span>{text(locale, "密码", "Password")}</span><input id="login-password" type="password" name="password" autoComplete="current-password" value={password} onFocus={() => setSavedLoginMenuOpen(false)} onChange={(event) => setPassword(event.target.value)} required maxLength={128} /></label>
    <label className="login-remember full"><input type="checkbox" name="remember" checked={remember} onChange={(event) => setRemember(event.target.checked)} /><span>{text(locale, nativeAccountPicker ? "保存登录" : "记住登录 30 天", nativeAccountPicker ? "Save login" : "Keep me signed in for 30 days")}</span></label>
    {state.message && <p className="form-message error full" role="alert">{state.message}</p>}
    <button className="button primary full" disabled={pending}>{text(locale, pending ? "登录中…" : "登录", pending ? "Signing in…" : "Sign in")}<ArrowRight size={18} /></button>
  </form>;
}
