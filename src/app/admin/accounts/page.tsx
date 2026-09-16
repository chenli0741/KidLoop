import Link from "next/link";
import { identityQuery } from "@/lib/identity-db";
import { InvitationForm,type InvitationParent } from "@/components/invitation-form";
import { resendMemberInvitation,revokeMemberInvitation } from "@/app/accounts/invitation-actions";
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
  const [accounts, drivers, students, parents, invitations] = await Promise.all([
    query<{ id: string; name: string; email: string; phone:string; updatedAt:string; driver_id:string|null; role: UserRole; active: boolean; driver_name: string | null; student_ids: string[] }>(`
      select u.id, case when u.role='DRIVER' then d.name else u.name end as name, u.email, case when u.role='DRIVER' then d.phone else u.phone end as phone, u.updated_at::text as "updatedAt", u.driver_id, u.role, u.active, d.name as driver_name,
        coalesce((select array_agg(student_id::text) from user_students where user_id = u.id), '{}') as student_ids
      from app_users u left join drivers d on d.id = u.driver_id order by u.created_at
    `), getDrivers(), query<AccountStudent>(`select st.id,st.name,sc.id as "schoolId",coalesce(sc.short_name,sc.name) as "schoolName" from students st join schools sc on sc.id = st.school_id where st.active or exists(select 1 from user_students us where us.student_id=st.id) order by coalesce(sc.short_name,sc.name),st.name`).then(result=>result.rows),
    query<InvitationParent>(`select p.id,p.name,coalesce(p.email,'') email,string_agg(s.name,', ' order by s.name) children from parents p join students s on s.parent_id=p.id where s.active group by p.id order by p.name`).then(r=>r.rows),
    identityQuery<{id:string;name:string;email:string;role:UserRole;status:string;expired:boolean}>(`select id,name,email,role,status,expires_at<=now() expired from tenant_invitations where tenant_id=$1 order by created_at desc limit 50`,[admin.tenantId]).then(r=>r.rows),
  ]);
  const labels = { ADMIN: text(locale, "公司工作人员", "Company staff"), DRIVER: text(locale, "司机", "Driver"), PARENT: text(locale, "家长", "Parent") };
  return <div className="page-container"><PageHeader eyebrow="Kid Loop Rides" title={text(locale, "登录账号", "Login accounts")} description={text(locale, "邀请公司工作人员、司机和家长，并管理已加入成员。对方通过邮件激活，密码由本人设置。", "Invite company staff, drivers and parents. Recipients activate by email and manage their own passwords.")} />
    <p className="mobile-only web-admin-notice">{text(locale, "系统账号管理请使用电脑端 Web 后台。个人资料请点击右上角账号图标。", "Use the desktop Web admin to manage system accounts. For your own profile, use the account icon.")}</p>
    <p><Link className="button secondary" href="/organizations">{text(locale,"公司资料与邮件服务","Company details and email service")}</Link></p>
    <div className="split-layout desktop-only"><section className="account-list">{accounts.rows.map((account) => <article className="account-card" key={account.id}>
      <header><div><h2>{account.name}</h2><p>{account.email}</p></div><span className="status-badge">{labels[account.role]} · {account.active ? text(locale, "启用", "Active") : text(locale, "停用", "Disabled")}</span><RosterCreateDialog iconOnly icon="edit" title={text(locale,"编辑账号","Edit account")} closeLabel={text(locale,"关闭","Close")}><AccountForm key={account.updatedAt} initial={account} drivers={drivers} students={students}/></RosterCreateDialog></header>
      {account.phone && <p>{text(locale,"电话","Phone")}: {account.phone}</p>}
      {account.driver_name && <p>{text(locale, "司机", "Driver")}：{account.driver_name}</p>}
      {account.role === "PARENT" && <details className="account-details"><summary>{text(locale, "绑定孩子", "Linked children")} · {account.student_ids.length}</summary><ActionForm action={updateChildLinks} submitLabel={text(locale, "保存绑定", "Save links")}><input type="hidden" name="userId" value={account.id} /><StudentSchoolChecklist students={students} selectedIds={account.student_ids} legend={text(locale,"选择孩子","Select children")} schoolLabel={text(locale,"按学校筛选","Filter by school")} allSchoolsLabel={text(locale,"全部学校","All schools")} /></ActionForm></details>}

      {account.id !== admin.id && <form action={setAccountActive}><input type="hidden" name="userId" value={account.id} /><input type="hidden" name="active" value={String(!account.active)} /><button className="button secondary">{account.active ? text(locale, "停用机构绑定", "Disable membership") : text(locale, "启用机构绑定", "Enable membership")}</button></form>}
    </article>)}</section>
    <FormPanel heading={<div className="panel-heading"><ShieldCheck size={20} /><div><h2>{text(locale, "邀请公司成员", "Invite company members")}</h2><p>{text(locale, "公司工作人员、司机或家长", "Company staff, driver, or parent")}</p></div></div>}><InvitationForm drivers={drivers.filter(driver => !accounts.rows.some(account => account.driver_id === driver.id))} parents={parents} /></FormPanel></div>
    <section className="content-section desktop-only"><h2>{text(locale,'邀请记录','Invitations')}</h2>{!invitations.length&&<p>{text(locale,'暂无邀请','No invitations yet')}</p>}{invitations.map(i=><article className="account-card" key={i.id}><h3>{i.name} · {labels[i.role]}</h3><p>{i.email}</p><p>{i.status==='ACCEPTED'?text(locale,'已接受','Accepted'):i.status==='REVOKED'?text(locale,'已撤销','Revoked'):i.expired?text(locale,'已过期','Expired'):i.status==='FAILED'?text(locale,'发送失败','Send failed'):i.status==='SENT'?text(locale,'已发送，等待接受','Sent, awaiting acceptance'):text(locale,'准备发送','Preparing delivery')}</p>{i.status!=='ACCEPTED'&&<ActionForm action={resendMemberInvitation} submitLabel={text(locale,'重新发送邀请','Resend invitation')}><input type="hidden" name="invitationId" value={i.id}/></ActionForm>}{['PREPARING','SENT','FAILED'].includes(i.status)&&<form action={revokeMemberInvitation}><input type="hidden" name="invitationId" value={i.id}/><button className="button secondary">{text(locale,'撤销邀请','Revoke invitation')}</button></form>}</article>)}</section>
  </div>;
}
