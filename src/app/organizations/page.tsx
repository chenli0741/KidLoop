import Link from "next/link";
import { redirect } from "next/navigation";
import { institutionAccess } from "@/lib/institution-access";
import { requireIdentity } from "@/lib/identity";
import { getUser, homeFor } from "@/lib/auth";
import { identityQuery } from "@/lib/identity-db";
import { query } from "@/lib/db";
import { getLocale } from "@/lib/i18n-server";
import { text } from "@/lib/i18n";
import { ActionForm } from "@/components/action-form";
import type { AccountStudent } from "@/components/student-school-checklist";
import { AccountForm } from "@/components/account-form";
import { logout } from "@/app/login/actions";
import { createOrganization,joinOrganization,enterOrganization,renameOrganization,rejectJoinRequest } from "./actions";
export default async function OrganizationsPage({searchParams}:{searchParams:Promise<{unavailable?:string}>}) {
  const account=await requireIdentity(),user=await getUser(),l=await getLocale();
  if (user && user.role !== "ADMIN") redirect(homeFor(user.role));
  const {unavailable}=await searchParams;
  const memberships=(await identityQuery<{id:string;name:string;active:boolean;role:string}>(`select t.id,t.name,(u.active and t.active) active,u.role from app_users u join tenants t on t.id=u.tenant_id where u.account_id=$1 order by t.name`,[account.id])).rows;
  const access=institutionAccess(account,memberships);
  const ownRequests=(await identityQuery<{name:string;status:string}>(`select t.name,r.status from tenant_join_requests r join tenants t on t.id=r.tenant_id where r.account_id=$1 order by r.created_at desc`,[account.id])).rows;
  const settings=user?.role==='ADMIN'?(await identityQuery<{join_code:string}>('select join_code from tenants where id=$1',[user.tenantId])).rows[0]:null;
  const requests=settings?(await identityQuery<{id:string;name:string;email:string}>(`select r.id,a.name,a.email from tenant_join_requests r join login_accounts a on a.id=r.account_id where r.tenant_id=$1 and r.status='PENDING' order by r.created_at`,[user!.tenantId])).rows:[];
  const drivers=settings?(await query<{id:string;name:string}>('select id,name from drivers where active order by name')).rows:[];
  const students=settings?(await query<AccountStudent>(`select s.id,s.name,sc.id as "schoolId",coalesce(sc.short_name,sc.name) as "schoolName" from students s join schools sc on sc.id=s.school_id where s.active order by sc.name,s.name`)).rows:[];
  return <div className={user?'page-container institution-page':'login-page'}><section className={user?'':'login-card institution-card'}>
    <span className="eyebrow">KidLoop · {account.email}</span><h1>{text(l,"我的机构","My institutions")}</h1>
    <p>{user?text(l,`当前机构：${user.tenantName}。如需进入其他机构，请退出后重新登录。`,`Current institution: ${user.tenantName}. Sign out and sign in to enter another institution.`):text(l,"请选择本次登录的接送机构。尚未加入机构时，请按下方注册身份指引办理。","Select an institution for this login. If you have not joined one, follow the guidance for your registered role below.")}</p>
    {unavailable&&<p role="alert">{text(l,"机构权限已改变，请刷新或重新登录。","Access changed. Refresh or sign in again.")}</p>}
    {account.tenantId&&!user&&<p role="alert">{text(l,"本次登录的机构权限已失效，请退出并重新登录。","Your selected institution is no longer available. Sign out and sign in again.")}</p>}
    <div className="institution-list">{memberships.map(t=><article className="account-card" key={t.id}><h2>{t.name}</h2><p>{t.active?text(l,"已绑定","Bound"):text(l,"已停用，请联系机构管理员","Disabled; contact the institution")}</p>{!account.tenantId&&t.active?<form action={enterOrganization}><input type="hidden" name="identityContext" value={account.contextKey}/><input type="hidden" name="tenantId" value={t.id}/><button className="button primary">{text(l,"进入机构","Enter institution")}</button></form>:user?.tenantId===t.id?<Link className="button secondary" href={homeFor(user.role)}>{text(l,"返回当前机构","Return to institution")}</Link>:null}</article>)}</div>
    {settings&&<section className="account-card"><h2>{text(l,"机构设置","Institution settings")}</h2><ActionForm action={renameOrganization} submitLabel={text(l,"保存名称","Save name")}><label className="full"><span>{text(l,"机构名称","Institution name")}</span><input name="name" defaultValue={user!.tenantName} maxLength={100} required/></label></ActionForm><p>{text(l,"将机构代码提供给需要加入的人；提交申请后仍须你批准。","Share this code with people who need to join. Requests still need your approval.")}</p><code className="institution-code">{settings.join_code}</code></section>}
    {settings&&<section><h2>{text(l,"待审批申请","Pending requests")} · {requests.length}</h2>{requests.map(r=><article className="account-card" key={r.id}><h3>{r.name}</h3><p>{r.email}</p><AccountForm drivers={drivers} students={students} requestedAccount={{id:r.id,email:r.email}}/><form action={rejectJoinRequest}><input type="hidden" name="requestId" value={r.id}/><button className="button secondary">{text(l,"拒绝申请","Reject request")}</button></form></article>)}</section>}
    {access.create && <section className="account-card" id="create"><h2>{text(l,"创建接送机构","Create an institution")}</h2><p>{text(l,"你将成为新机构管理员。新机构从空白业务资料开始。","You will administer the new institution. Its operational data starts empty.")}</p><ActionForm action={createOrganization} submitLabel={text(l,"创建机构","Create institution")}><input type="hidden" name="identityContext" value={account.contextKey}/><label className="full"><span>{text(l,"机构名称","Institution name")}</span><input name="name" maxLength={100} required/></label></ActionForm></section>}
    {access.join && <section className="account-card" id="join"><h2>{text(l,"申请加入机构","Request to join")}</h2><ActionForm action={joinOrganization} submitLabel={text(l,"提交申请","Submit request")}><input type="hidden" name="identityContext" value={account.contextKey}/><label className="full"><span>{text(l,"机构代码（向管理员获取）","Institution code (ask the administrator)")}</span><input name="code" maxLength={32} minLength={32} required autoComplete="off"/></label></ActionForm>{ownRequests.map((r,i)=><p key={i}>{r.name} · {r.status==='PENDING'?text(l,"待审批","Pending"):r.status==='APPROVED'?text(l,"已批准","Approved"):text(l,"已拒绝","Rejected")}</p>)}</section>}
    <form action={logout}><button className="button secondary">{text(l,"退出登录","Sign out")}</button></form>
  </section></div>;
}
