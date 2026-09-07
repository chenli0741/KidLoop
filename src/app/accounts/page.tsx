import { ShieldCheck, KeyRound } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { getDrivers, getStudents } from "@/lib/data";
import { getLocale } from "@/lib/i18n-server";
import { text } from "@/lib/i18n";
import { PageHeader } from "@/components/page-header";
import { AccountForm } from "@/components/account-form";
import { ActionForm } from "@/components/action-form";
import { FormPanel } from "@/components/form-panel";
import { resetAccountPassword, setAccountActive, updateChildLinks } from "./actions";
import type { UserRole } from "@/lib/types";

export default async function AccountsPage() {
  const admin = await requireUser(["ADMIN"]);
  const locale = await getLocale();
  const [accounts, drivers, students] = await Promise.all([
    query<{ id: string; name: string; email: string; role: UserRole; active: boolean; driver_name: string | null; student_ids: string[] }>(`
      select u.id, u.name, u.email, u.role, u.active, d.name as driver_name,
        coalesce((select array_agg(student_id::text) from user_students where user_id = u.id), '{}') as student_ids
      from app_users u left join drivers d on d.id = u.driver_id order by u.created_at
    `), getDrivers(), getStudents(),
  ]);
  const labels = { ADMIN: text(locale, "管理员", "Admin"), DRIVER: text(locale, "司机", "Driver"), PARENT: text(locale, "家长", "Parent") };
  return <div className="page-container"><PageHeader eyebrow="KidLoop" title={text(locale, "登录账号", "Login accounts")} description={text(locale, "管理三个角色的账号，明确绑定司机和孩子。", "Manage three roles and explicitly link drivers and children.")} />
    <div className="split-layout"><section className="account-list">{accounts.rows.map((account) => <article className="account-card" key={account.id}>
      <header><div><h2>{account.name}</h2><p>{account.email}</p></div><span className="status-badge">{labels[account.role]} · {account.active ? text(locale, "启用", "Active") : text(locale, "停用", "Disabled")}</span></header>
      {account.driver_name && <p>{text(locale, "司机", "Driver")}：{account.driver_name}</p>}
      {account.role === "PARENT" && <details className="account-details"><summary>{text(locale, "绑定孩子", "Linked children")} · {account.student_ids.length}</summary><ActionForm action={updateChildLinks} submitLabel={text(locale, "保存绑定", "Save links")}><input type="hidden" name="userId" value={account.id} /><fieldset className="student-checklist"><legend>{text(locale, "选择孩子", "Select children")}</legend>{students.map((student) => <label key={student.id}><input type="checkbox" name="studentIds" value={student.id} defaultChecked={account.student_ids.includes(student.id)} /><span>{student.name} · {student.schoolName}</span></label>)}</fieldset></ActionForm></details>}
      <details className="account-details"><summary><KeyRound size={15} />{text(locale, "重置密码", "Reset password")}</summary><ActionForm action={resetAccountPassword} submitLabel={text(locale, "重置密码", "Reset password")}><input type="hidden" name="userId" value={account.id} /><label className="full"><span>{text(locale, "新密码（12–128 字符）", "New password (12–128 characters)")}</span><input type="password" name="password" minLength={12} maxLength={128} autoComplete="new-password" required /></label></ActionForm></details>
      {account.id !== admin.id && <form action={setAccountActive}><input type="hidden" name="userId" value={account.id} /><input type="hidden" name="active" value={String(!account.active)} /><button className="button secondary">{account.active ? text(locale, "停用账号", "Disable account") : text(locale, "启用账号", "Enable account")}</button></form>}
    </article>)}</section>
    <FormPanel heading={<div className="panel-heading"><ShieldCheck size={20} /><div><h2>{text(locale, "创建登录账号", "Create login account")}</h2><p>{text(locale, "管理员、司机或家长", "Admin, driver, or parent")}</p></div></div>}><AccountForm drivers={drivers} students={students} /></FormPanel></div>
  </div>;
}
