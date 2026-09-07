import { cookies } from "next/headers";
import { LOGIN_EMAIL_COOKIE, readLoginEmail } from "@/lib/login-preferences";
import { BusFront, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { getUser, homeFor } from "@/lib/auth";
import { getLocale } from "@/lib/i18n-server";
import { text } from "@/lib/i18n";
import { LoginForm } from "@/components/login-form";
import { setLocale } from "@/app/actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ passwordChanged?: string }> }) {
  const { passwordChanged } = await searchParams;
  const [user, locale] = await Promise.all([getUser(), getLocale()]);
  if (user) redirect(homeFor(user.role));
  const rememberedEmail = readLoginEmail((await cookies()).get(LOGIN_EMAIL_COOKIE)?.value);
  return <main className="login-page"><section className="login-card">
    <div className="login-brand"><span className="brand-mark"><BusFront size={25} /></span><strong>KidLoop</strong></div>
    <span className="eyebrow">{text(locale, "安心接送，每一天", "A little peace of mind, every day")}</span>
    <h1>{text(locale, "欢迎回来", "Welcome back")}</h1>
    <p>{text(locale, "登录后查看属于你的接送安排。", "Sign in to see your transportation plans.")}</p>
    {passwordChanged === "1" && <p className="form-message success" role="status">{text(locale, "密码已更新，请使用新密码登录。", "Password updated. Sign in with your new password.")}</p>}
    <LoginForm rememberedEmail={rememberedEmail} />
    <p className="login-help"><ShieldCheck size={16} />{text(locale, "管理员 · 司机 · 家长", "Admin · Driver · Parent")}</p>
    <p>{text(locale, "请联系管理员开通账号或重置密码。", "Contact your administrator for an account or password reset.")}</p>
    <form action={setLocale} className="login-languages"><button name="locale" value="zh" aria-pressed={locale === "zh"}>中文</button><button name="locale" value="en" aria-pressed={locale === "en"}>English</button></form>
  </section></main>;
}
