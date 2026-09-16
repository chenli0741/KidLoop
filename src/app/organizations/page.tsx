import Link from "next/link";
import { invitationMailConfig } from "@/lib/invitation-email";
import { redirect } from "next/navigation";
import { requireIdentity } from "@/lib/identity";
import { getUser,homeFor } from "@/lib/auth";
import { identityQuery } from "@/lib/identity-db";
import { getLocale } from "@/lib/i18n-server";
import { text } from "@/lib/i18n";
import { ActionForm } from "@/components/action-form";
import { logout } from "@/app/login/actions";
import { enterOrganization,saveCompany } from "./actions";
export default async function OrganizationsPage() {
 const account=await requireIdentity(),user=await getUser(),l=await getLocale();
 if(user&&user.role!=='ADMIN')redirect(homeFor(user.role));
 const memberships=(await identityQuery<{id:string;name:string;active:boolean}>(`select t.id,t.name,(u.active and t.active) active from app_users u join tenants t on t.id=u.tenant_id where u.account_id=$1 order by t.name`,[account.id])).rows;
 let mailConfigured=false;try{invitationMailConfig();mailConfigured=true;}catch{}
 const company=user?(await identityQuery<{name:string;contact_name:string;contact_email:string;phone:string;address:string}>('select name,contact_name,contact_email,phone,address from tenants where id=$1',[user.tenantId])).rows[0]:null;
 return <div className={user?'page-container institution-page':'login-page'}><section className={user?'':'login-card institution-card'}>
 <h1>{user?text(l,'公司管理','Company settings'):text(l,'选择本次登录的公司','Choose a company for this login')}</h1>
 <p>{user?text(l,'如需进入其他公司，请退出后重新登录。','Sign out and sign in to enter another company.'):text(l,'只进入本次选择的公司。加入新公司请使用邮件邀请。','You will enter only the selected company. Use an email invitation to join another company.')}</p>
 {!memberships.length&&<p>{text(l,'暂未绑定公司。请打开公司的邀请邮件，或联系公司工作人员。','No company membership yet. Open your invitation email or contact the company.')}</p>}
 {account.tenantId&&!user&&<p role="alert">{text(l,'当前公司权限已失效，请退出后重新登录。','Your selected company is unavailable. Sign out and sign in again.')}</p>}
 <div className="institution-list">{memberships.map(t=><article className="account-card" key={t.id}><h2>{t.name}</h2>{!t.active?<p>{text(l,'已停用，请联系公司','Disabled; contact the company')}</p>:!account.tenantId?<form action={enterOrganization}><input type="hidden" name="identityContext" value={account.contextKey}/><input type="hidden" name="tenantId" value={t.id}/><button className="button primary">{text(l,'进入公司','Enter company')}</button></form>:user?.tenantId===t.id?<Link className="button secondary" href={homeFor(user.role)}>{text(l,'返回公司','Return to company')}</Link>:null}</article>)}</div>
 {company&&<section className="account-card"><h2>{text(l,'公司资料','Company details')}</h2><ActionForm action={saveCompany} submitLabel={text(l,'保存资料','Save details')}>
 <label className="full"><span>{text(l,'公司名称','Company name')}</span><input name="name" defaultValue={company.name} maxLength={100} required/></label>
 <label><span>{text(l,'联系人','Contact name')}</span><input name="contact" defaultValue={company.contact_name} maxLength={100} required/></label>
 <label><span>{text(l,'联系邮箱','Contact email')}</span><input name="email" type="email" defaultValue={company.contact_email} maxLength={254} required/></label>
 <label><span>{text(l,'联系电话','Contact phone')}</span><input name="phone" type="tel" defaultValue={company.phone} maxLength={80} required/></label>
 <label className="full"><span>{text(l,'公司地址','Company address')}</span><input name="address" defaultValue={company.address} maxLength={500} required/></label>
 </ActionForm><Link href="/admin/accounts">{text(l,'邀请和管理公司成员','Invite and manage company members')}</Link></section>}
 {user&&<section className="account-card"><h2>{text(l,'邮件服务','Email service')}</h2><p>{mailConfigured?text(l,'平台邮件服务已配置。发送结果将在邀请记录中显示。','Platform email service is configured. Sending status appears in invitation records.'):text(l,'平台邮件服务尚未配置，暂不能发送邀请。请联系平台维护人员配置发信服务、发件地址和系统网址。','Platform email service is not configured. Ask the platform operator to configure the email service, sender address and application URL before sending invitations.')}</p></section>}
 <form action={logout}><button className="button secondary">{text(l,'退出登录','Sign out')}</button></form>
 </section></div>;
}
