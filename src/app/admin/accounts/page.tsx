import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { getDrivers } from "@/lib/data";
import { getLocale } from "@/lib/i18n-server";
import { text } from "@/lib/i18n";
import { PageHeader } from "@/components/page-header";
import { RosterCreateDialog } from "@/components/roster-controls";
import { AccountForm } from "@/components/account-form";
import { ActionForm } from "@/components/action-form";
import { StudentSchoolChecklist, type AccountStudent } from "@/components/student-school-checklist";
import { FormPanel } from "@/components/form-panel";
import { setAccountActive, updateChildLinks } from "@/app/accounts/actions";
import type { UserRole } from "@/lib/types";

export default async function AccountsPage() {
  const admin = await requireUser(["ADMIN"]);
  const locale = await getLocale();
  const [accounts, drivers, students] = await Promise.all([
    query<{ id: string; name: string; email: string; phone:string; updatedAt:string; driver_id:string|null; role: UserRole; active: boolean; driver_name: string | null; student_ids: string[] }>(`
      select u.id, case when u.role='DRIVER' then d.name else u.name end as name, u.email, case when u.role='DRIVER' then d.phone else u.phone end as phone, u.updated_at::text as "updatedAt", u.driver_id, u.role, u.active, d.name as driver_name,
        coalesce((select array_agg(student_id::text) from user_students where user_id = u.id), '{}') as student_ids
      from app_users u left join drivers d on d.id = u.driver_id order by u.created_at
    `), getDrivers(), query<AccountStudent>(`select st.id,st.name,sc.id as "schoolId",coalesce(sc.short_name,sc.name) as "schoolName" from students st join schools sc on sc.id = st.school_id where st.active or exists(select 1 from user_students us where us.student_id=st.id) order by coalesce(sc.short_name,sc.name),st.name`).then(result=>result.rows),
  ]);
  const labels = { ADMIN: text(locale, "管理员", "Admin"), DRIVER: text(locale, "司机", "Driver"), PARENT: text(locale, "家长", "Parent") };
  return <div className="page-container"><PageHeader eyebrow="Kid Loop Rides" title={text(locale, "登录账号", "Login accounts")} description={text(locale, "管理本机构的账号绑定、角色、司机和孩子。用户自行注册，密码由本人管理。", "Manage institution memberships, roles, drivers and children. Users register and manage their own passwords.")} />
    <p className="mobile-only web-admin-notice">{text(locale, "系统账号管理请使用电脑端 Web 后台。个人资料请点击右上角账号图标。", "Use the desktop Web admin to manage system accounts. For your own profile, use the account icon.")}</p>
    <p><Link className="button secondary" href="/organizations">{text(locale,"机构设置与加入申请","Institution settings and join requests")}</Link></p>
    <div className="split-layout desktop-only"><section className="account-list">{accounts.rows.map((account) => <article className="account-card" key={account.id}>
      <header><div><h2>{account.name}</h2><p>{account.email}</p></div><span className="status-badge">{labels[account.role]} · {account.active ? text(locale, "启用", "Active") : text(locale, "停用", "Disabled")}</span><RosterCreateDialog iconOnly icon="edit" title={text(locale,"编辑账号","Edit account")} closeLabel={text(locale,"关闭","Close")}><AccountForm key={account.updatedAt} initial={account} drivers={drivers} students={students}/></RosterCreateDialog></header>
      {account.phone && <p>{text(locale,"电话","Phone")}: {account.phone}</p>}
      {account.driver_name && <p>{text(locale, "司机", "Driver")}：{account.driver_name}</p>}
      {account.role === "PARENT" && <details className="account-details"><summary>{text(locale, "绑定孩子", "Linked children")} · {account.student_ids.length}</summary><ActionForm action={updateChildLinks} submitLabel={text(locale, "保存绑定", "Save links")}><input type="hidden" name="userId" value={account.id} /><StudentSchoolChecklist students={students} selectedIds={account.student_ids} legend={text(locale,"选择孩子","Select children")} schoolLabel={text(locale,"按学校筛选","Filter by school")} allSchoolsLabel={text(locale,"全部学校","All schools")} /></ActionForm></details>}

      {account.id !== admin.id && <form action={setAccountActive}><input type="hidden" name="userId" value={account.id} /><input type="hidden" name="active" value={String(!account.active)} /><button className="button secondary">{account.active ? text(locale, "停用机构绑定", "Disable membership") : text(locale, "启用机构绑定", "Enable membership")}</button></form>}
    </article>)}</section>
    <FormPanel heading={<div className="panel-heading"><ShieldCheck size={20} /><div><h2>{text(locale, "绑定已注册账号", "Bind registered account")}</h2><p>{text(locale, "管理员、司机或家长", "Admin, driver, or parent")}</p></div></div>}><AccountForm drivers={drivers} students={students} /></FormPanel></div>
  </div>;
}
