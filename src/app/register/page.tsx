import Link from "next/link";
import { redirect } from "next/navigation";
import { getIdentity } from "@/lib/identity";
import { ActionForm } from "@/components/action-form";
import { register } from "./actions";
import { getLocale } from "@/lib/i18n-server";
import { text } from "@/lib/i18n";
export default async function RegisterPage() {
  if (await getIdentity()) redirect("/organizations");
  const l = await getLocale();
  return <main className="login-page"><section className="login-card institution-card"><span className="eyebrow">KidLoop</span>
    <h1>{text(l,"注册并开通服务公司","Register your transportation company")}</h1>
    <p>{text(l,"填写负责人账号和公司资料后，一次性完成开通。其他工作人员、司机和家长由公司通过邮件邀请加入。","Complete your account and company details together. Other staff, drivers and parents join by email invitation.")}</p>
    <ActionForm action={register} submitLabel={text(l,"注册并开通公司","Create account and company")}>
      <h2 className="full">{text(l,"负责人账号","Company owner account")}</h2>
      <label className="full"><span>{text(l,"负责人姓名","Contact name")}</span><input name="name" autoComplete="name" maxLength={100} required /></label>
      <label className="full"><span>{text(l,"登录及联系邮箱","Login and contact email")}</span><input name="email" type="email" autoComplete="email" maxLength={254} required /></label>
      <label className="full"><span>{text(l,"密码（6–128 字符）","Password (6–128 characters)")}</span><input name="password" type="password" autoComplete="new-password" minLength={6} maxLength={128} required /></label>
      <label className="full"><span>{text(l,"再次输入密码","Confirm password")}</span><input name="confirmPassword" type="password" autoComplete="new-password" minLength={6} maxLength={128} required /></label>
      <h2 className="full">{text(l,"服务公司资料","Company details")}</h2>
      <label className="full"><span>{text(l,"公司名称","Company name")}</span><input name="companyName" autoComplete="organization" maxLength={100} required /></label>
      <label className="full"><span>{text(l,"联系电话","Contact phone")}</span><input name="phone" type="tel" autoComplete="tel" maxLength={80} required /></label>
      <label className="full"><span>{text(l,"公司地址","Company address")}</span><input name="address" autoComplete="street-address" maxLength={500} required /></label>
    </ActionForm><p><Link href="/login">{text(l,"已有账号？登录","Already registered? Sign in")}</Link></p>
    <p>{text(l,"加入已有公司，请打开该公司发给你的邀请邮件。","To join an existing company, open its invitation email.")}</p>
  </section></main>;
}
