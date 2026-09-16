import Link from "next/link";
import { getIdentity } from "@/lib/identity";
import { cookies } from "next/headers";
import { LOGIN_EMAIL_COOKIE, readLoginEmail } from "@/lib/login-preferences";
import { BusFront, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { getUser, homeFor } from "@/lib/auth";
import { getLocale } from "@/lib/i18n-server";
import { text } from "@/lib/i18n";
import { LoginForm } from "@/components/login-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ passwordChanged?: string; registered?: string }> }) {
  const { passwordChanged, registered } = await searchParams;
  const [user, locale] = await Promise.all([getUser(), getLocale()]);
  if (user) redirect(homeFor(user.role));
  if (await getIdentity()) redirect("/organizations");
  const rememberedEmail = readLoginEmail((await cookies()).get(LOGIN_EMAIL_COOKIE)?.value);
  return <main className="login-page"><section className="login-card">
    <div className="login-brand"><span className="brand-mark"><BusFront size={25} /></span><strong>Kid Loop Rides</strong></div>
    <span className="eyebrow">{text(locale, "安心接送，每一天", "A little peace of mind, every day")}</span>
    <h1>{text(locale, "欢迎回来", "Welcome back")}</h1>
    <p>{text(locale, "登录后查看属于你的接送安排。", "Sign in to see your transportation plans.")}</p>
    {passwordChanged === "1" && <p className="form-message success" role="status">{text(locale, "密码已更新，请使用新密码登录。", "Password updated. Sign in with your new password.")}</p>}
    {registered === "1" && <p role="status">{text(locale,"注册成功，请登录继续。","Registered. Sign in to continue.")}</p>}
    <LoginForm rememberedEmail={rememberedEmail} />
    <p className="login-help"><ShieldCheck size={16} />{text(locale, "管理员 · 司机 · 家长", "Admin · Driver · Parent")}</p>
    <p><Link href="/register">{text(locale,"注册账号","Register")}</Link></p><div className="institution-entry"><Link href="/register?intent=create">{text(locale,"创建机构","Create institution")}</Link><Link href="/register?intent=join">{text(locale,"加入机构","Join institution")}</Link></div><p>{text(locale,"创建或加入机构前，请先注册或登录。","Register or sign in before creating or joining an institution.")}</p>
  </section></main>;
}
