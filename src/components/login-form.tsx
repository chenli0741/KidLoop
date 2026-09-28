"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { ArrowRight, Trash2 } from "lucide-react";
import { login, type LoginState } from "@/app/login/actions";
import { useLocale } from "@/components/locale-provider";
import { text } from "@/lib/i18n";
import { listSavedLogins, removeSavedLogin, saveLogin, supportsSavedLogins, type SavedLogin } from "@/lib/native-credentials";

export function LoginForm({ rememberedEmail = "", invitation = "" }: { rememberedEmail?: string; invitation?: string }) {
  const [email, setEmail] = useState(rememberedEmail);
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [savedLogins, setSavedLogins] = useState<SavedLogin[]>([]);
  const [selectedEmail, setSelectedEmail] = useState("");
  const [nativeAccountPicker, setNativeAccountPicker] = useState(false);
  const navigated = useRef(false);
  const locale = useLocale();
  const initialState: LoginState = { ok: false, message: "" };
  const [state, action, pending] = useActionState(login, initialState);

  useEffect(() => {
    if (!supportsSavedLogins()) return;
    void listSavedLogins().then((accounts) => {
      setNativeAccountPicker(true);
      setSavedLogins(accounts);
      const selected = accounts.find((account) => account.email === rememberedEmail) ?? accounts[0];
      if (selected) {
        setSelectedEmail(selected.email);
        setEmail(selected.email);
        setPassword(selected.password);
      }
    }).catch(() => undefined);
  }, [rememberedEmail]);

  useEffect(() => {
    if (!state.ok || !state.redirectTo || navigated.current) return;
    navigated.current = true;
    const destination = state.redirectTo;
    const accountEmail = state.email ?? email.trim().toLowerCase();
    void (async () => {
      if (remember && accountEmail && password) {
        try { await saveLogin({ email: accountEmail, password }); } catch { /* Login must still continue. */ }
      }
      window.location.replace(destination);
    })();
  }, [email, password, remember, state]);

  function selectAccount(value: string) {
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

  async function forgetSelected() {
    if (!selectedEmail) return;
    await removeSavedLogin(selectedEmail);
    const remaining = savedLogins.filter((account) => account.email !== selectedEmail);
    setSavedLogins(remaining);
    const next = remaining[0];
    setSelectedEmail(next?.email ?? "");
    setEmail(next?.email ?? "");
    setPassword(next?.password ?? "");
  }

  return <form action={action} id="login-form" autoComplete="on" className="form-grid login-form">
    <input type="hidden" name="invitation" value={invitation}/>
    {nativeAccountPicker && savedLogins.length > 0 && <div className="saved-login-row full">
      <label><span>{text(locale, "已保存账号", "Saved account")}</span><select value={selectedEmail} onChange={(event) => selectAccount(event.target.value)}>
        {savedLogins.map((account) => <option key={account.email} value={account.email}>{account.email}</option>)}
        <option value="">{text(locale, "使用其他账号", "Another account")}</option>
      </select></label>
      <button type="button" className="button secondary saved-login-forget" onClick={() => void forgetSelected()} disabled={!selectedEmail} aria-label={text(locale,"忘记此账号","Forget account")}><Trash2 size={17}/><span>{text(locale,"忘记","Forget")}</span></button>
    </div>}
    <label className="full"><span>{text(locale, "邮箱", "Email")}</span><input id="login-email" type="email" name="email" autoComplete="username" autoCapitalize="none" spellCheck={false} value={email} onChange={(event) => { const value=event.target.value; setEmail(value); if(value.trim().toLowerCase()!==selectedEmail)setSelectedEmail(""); }} required maxLength={254} /></label>
    <label className="full"><span>{text(locale, "密码", "Password")}</span><input id="login-password" type="password" name="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required maxLength={128} /></label>
    <label className="login-remember full"><input type="checkbox" name="remember" checked={remember} onChange={(event) => setRemember(event.target.checked)} /><span>{text(locale, nativeAccountPicker ? "记住此账号" : "记住登录 30 天", nativeAccountPicker ? "Remember account" : "Keep me signed in for 30 days")}</span></label>
    {state.message && <p className="form-message error full" role="alert">{state.message}</p>}
    <button className="button primary full" disabled={pending}>{text(locale, pending ? "登录中…" : "登录", pending ? "Signing in…" : "Sign in")}<ArrowRight size={18} /></button>
  </form>;
}
