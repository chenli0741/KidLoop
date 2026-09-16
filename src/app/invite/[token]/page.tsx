import Link from "next/link";
import type { Metadata } from "next";
import { identityTransaction,identityQuery } from "@/lib/identity-db";
import { getIdentity } from "@/lib/identity";
import { readInvitation } from "@/lib/invitations";
import { getLocale } from "@/lib/i18n-server";
import { text } from "@/lib/i18n";
import { ActionForm } from "@/components/action-form";
import { logout } from "@/app/login/actions";
import { activateInvitation } from "./actions";
export const metadata:Metadata={robots:{index:false,follow:false},referrer:'no-referrer'};
export default async function InvitationPage({params}:{params:Promise<{token:string}>}) {
 const {token}=await params,l=await getLocale(),identity=await getIdentity();
 const invite=await identityTransaction(c=>readInvitation(c,token));
 if(!invite)return <main className="login-page"><section className="login-card"><h1>{text(l,'邀请不可用','Invitation unavailable')}</h1><p>{text(l,'邀请可能已过期、撤销或使用，请联系公司重新邀请。','This invitation may have expired, been revoked or already used. Contact the company for a new invitation.')}</p><Link href="/login">{text(l,'返回登录','Sign in')}</Link></section></main>;
 const exists=!!(await identityQuery('select 1 from login_accounts where email=$1',[invite.email])).rowCount;
 const matches=identity?.email===invite.email;
 const roles={ADMIN:text(l,'公司工作人员','Company staff'),DRIVER:text(l,'司机','Driver'),PARENT:text(l,'家长','Parent')};
 return <main className="login-page"><section className="login-card"><h1>{text(l,'公司邀请','Company invitation')}</h1><h2>{invite.company_name}</h2><p>{invite.name} · {roles[invite.role]}</p><p>{invite.email}</p>
 {identity&&!matches?<><p>{text(l,'当前登录邮箱与邀请不一致，请退出后使用受邀邮箱。','Your signed-in email does not match this invitation. Sign out and use the invited email.')}</p><form action={logout}><input type="hidden" name="invitation" value={token}/><button className="button secondary">{text(l,'退出当前账号','Sign out')}</button></form></>:!identity&&exists?<><p>{text(l,'你已有账号，请使用原账号登录后接受邀请。','You already have an account. Sign in to accept this invitation.')}</p><Link className="button primary" href={`/login?invitation=${token}`}>{text(l,'登录并接受邀请','Sign in to accept')}</Link></>:<ActionForm action={activateInvitation} submitLabel={identity?text(l,'接受邀请','Accept invitation'):text(l,'激活并加入公司','Activate and join company')}>
 <input type="hidden" name="token" value={token}/><input type="hidden" name="identityContext" value={identity?.contextKey??''}/>
 {!identity&&<><label className="full"><span>{text(l,'设置密码（6–128 字符）','Set password (6–128 characters)')}</span><input type="password" name="password" minLength={6} maxLength={128} autoComplete="new-password" required/></label><label className="full"><span>{text(l,'确认密码','Confirm password')}</span><input type="password" name="confirmPassword" minLength={6} maxLength={128} autoComplete="new-password" required/></label></>}
 <p className="full">{text(l,'接受后关联到该公司及公司指定的资料。已有账号的密码不会改变。','Accepting links your account to this company and the assigned records. Existing account passwords stay unchanged.')}</p>
 </ActionForm>}
 </section></main>;
}
