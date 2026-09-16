import Link from "next/link";
import { redirect } from "next/navigation";
import { getIdentity } from "@/lib/identity";
import { ActionForm } from "@/components/action-form";
import { register } from "./actions";
import { getLocale } from "@/lib/i18n-server";
import { text } from "@/lib/i18n";
export default async function RegisterPage({searchParams}:{searchParams:Promise<{intent?:string}>}) {
  const {intent}=await searchParams;
  if (await getIdentity()) redirect("/organizations");
  const l = await getLocale();
  return <main className="login-page"><section className="login-card"><span className="eyebrow">KidLoop</span>
    <h1>{intent==='create'?text(l,"注册并创建机构","Register to create an institution"):intent==='join'?text(l,"注册并申请加入","Register to join an institution"):text(l,"注册账号","Create an account")}</h1><p>{text(l,"选择你的注册身份。管理员可创建机构；司机和家长申请加入机构，由机构管理员批准。","Choose your role. Administrators can create an institution; drivers and parents request access from an institution administrator.")}</p>
    <ActionForm action={register} submitLabel={text(l,"注册","Register")}>
      <label className="full"><span>{text(l,"注册身份","Your role")}</span><select name="role" defaultValue={intent==='create'?'ADMIN':''} required><option value="" disabled>{text(l,"请选择","Select a role")}</option><option value="ADMIN">{text(l,"管理员","Administrator")}</option><option value="DRIVER">{text(l,"司机","Driver")}</option><option value="PARENT">{text(l,"家长","Parent")}</option></select></label>
      <label className="full"><span>{text(l,"姓名","Name")}</span><input name="name" autoComplete="name" maxLength={100} required /></label>
      <label className="full"><span>{text(l,"邮箱","Email")}</span><input name="email" type="email" autoComplete="email" maxLength={254} required /></label>
      <label className="full"><span>{text(l,"密码（6–128 字符）","Password (6–128 characters)")}</span><input name="password" type="password" autoComplete="new-password" minLength={6} maxLength={128} required /></label>
      <label className="full"><span>{text(l,"再次输入密码","Confirm password")}</span><input name="confirmPassword" type="password" autoComplete="new-password" minLength={6} maxLength={128} required /></label>
    </ActionForm><p><Link href="/login">{text(l,"已有账号？登录","Already registered? Sign in")}</Link></p>
  </section></main>;
}
