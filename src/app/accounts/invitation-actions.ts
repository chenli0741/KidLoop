"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { identityTransaction,identityQuery } from "@/lib/identity-db";
import { prepareInvitation,invitationAdmin,type InvitationInput } from "@/lib/invitations";
import { sendInvitationEmail } from "@/lib/invitation-email";
import { assertCompanyMailReady } from "@/lib/company-mail/service";
import { MailError } from "@/lib/connected-mail/types";
import { getLocale } from "@/lib/i18n-server";
import { text } from "@/lib/i18n";
import type { AuthUser,FormState } from "@/lib/types";
const invitationIdPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

async function deliver(admin:AuthUser,input:InvitationInput):Promise<FormState> {
 const l=await getLocale();
 try{await assertCompanyMailReady(admin);}catch{return {ok:false,message:text(l,'请先在公司设置连接或重新连接 Gmail；若连接功能未开通，请联系平台维护人员。','Connect or reconnect Gmail in company settings first. If connection is unavailable, contact the platform operator.')};}
 let invite;
 try{invite=await identityTransaction(c=>prepareInvitation(c,admin,input));}catch{return {ok:false,message:text(l,'无法邀请。请确认邮箱有效、尚未加入本公司，并选择本公司的司机或已有家长名单；频繁发送请稍后再试。','Unable to invite. Check the email, existing membership and company roster. Try later if sending too frequently.')};}
 try{
  await sendInvitationEmail(admin,invite);
  const sent=await identityQuery("update tenant_invitations set status='SENT',sent_at=now() where id=$1 and status='PREPARING' returning id",[invite.id]);
  revalidatePath('/admin/accounts');
  if(!sent.rowCount)return {ok:false,message:text(l,'该邀请已撤销或被更新，请使用最新邀请。','This invitation was revoked or replaced. Use the latest invitation.')};
  return {ok:true,message:text(l,'邀请邮件已提交发送，链接 7 天内有效。','Invitation email submitted for delivery. The link expires in 7 days.')};
 }catch(error){
  await identityQuery("update tenant_invitations set status='FAILED' where id=$1 and status='PREPARING'",[invite.id]);
  revalidatePath('/admin/accounts');revalidatePath('/organizations');
  if(error instanceof MailError && error.code==='RECONNECT')return {ok:false,message:text(l,'Gmail 授权已失效，请在公司设置重新连接后再发送。','Gmail authorization expired. Reconnect in company settings before sending.')};
  if(error instanceof MailError && error.code==='RATE_LIMIT')return {ok:false,message:text(l,'Gmail 暂时限制发送，请稍后再试。','Gmail temporarily limited sending. Please try again later.')};
  return {ok:false,message:text(l,'邮件发送未确认成功，请查看公司设置中的发送记录。不要连续重发，请先确认对方是否收到。','Sending was not confirmed. Check sending history in company settings and whether the recipient received it before resending.')};
 }
}
export async function sendMemberInvitation(_:FormState,form:FormData):Promise<FormState>{
 const admin=await requireUser(['ADMIN'],true);
 return deliver(admin,{email:String(form.get('email')??''),name:String(form.get('name')??''),role:String(form.get('role')??''),driverId:String(form.get('driverId')??'')||null,parentId:String(form.get('parentId')??'')||null});
}
export async function resendMemberInvitation(_:FormState,form:FormData):Promise<FormState>{
 const admin=await requireUser(['ADMIN'],true),l=await getLocale();
 if(!invitationIdPattern.test(String(form.get('invitationId')??'')))return {ok:false,message:text(l,'邀请不存在。','Invitation unavailable.')};
 const input=await identityTransaction(async c=>{
  await invitationAdmin(c,admin);
  return (await c.query<InvitationInput>(`select email,name,role,driver_id as "driverId",parent_id as "parentId" from tenant_invitations where id=$1 and tenant_id=$2 and status<>'ACCEPTED'`,[form.get('invitationId'),admin.tenantId])).rows[0];
 });
 if(!input)return {ok:false,message:text(l,'邀请不存在或已接受。','Invitation unavailable or already accepted.')};
 return deliver(admin,input);
}
export async function revokeMemberInvitation(form:FormData){
 const admin=await requireUser(['ADMIN'],true);
 if(!invitationIdPattern.test(String(form.get('invitationId')??'')))return;
 await identityTransaction(async c=>{await invitationAdmin(c,admin);await c.query("update tenant_invitations set status='REVOKED' where id=$1 and tenant_id=$2 and status in ('PREPARING','SENT','FAILED')",[form.get('invitationId'),admin.tenantId]);});
 revalidatePath('/admin/accounts');
}
