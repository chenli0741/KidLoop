"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { identityTransaction,identityQuery } from "@/lib/identity-db";
import { prepareInvitation,invitationAdmin,type InvitationInput } from "@/lib/invitations";
import { invitationMailConfig,sendInvitationEmail } from "@/lib/invitation-email";
import { getLocale } from "@/lib/i18n-server";
import { text } from "@/lib/i18n";
import type { AuthUser,FormState } from "@/lib/types";
const invitationIdPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

async function deliver(admin:AuthUser,input:InvitationInput):Promise<FormState> {
 const l=await getLocale();
 try{invitationMailConfig();}catch{return {ok:false,message:text(l,'邮件服务尚未配置，请先完成邮件服务配置。','Email service is not configured. Complete email service configuration first.')};}
 let invite;
 try{invite=await identityTransaction(c=>prepareInvitation(c,admin,input));}catch{return {ok:false,message:text(l,'无法邀请。请确认邮箱有效、尚未加入本公司，并选择本公司的司机或已有家长名单；频繁发送请稍后再试。','Unable to invite. Check the email, existing membership and company roster. Try later if sending too frequently.')};}
 try{
  await sendInvitationEmail(invite);
  const sent=await identityQuery("update tenant_invitations set status='SENT',sent_at=now() where id=$1 and status='PREPARING' returning id",[invite.id]);
  revalidatePath('/admin/accounts');
  if(!sent.rowCount)return {ok:false,message:text(l,'该邀请已撤销或被更新，请使用最新邀请。','This invitation was revoked or replaced. Use the latest invitation.')};
  return {ok:true,message:text(l,'邀请邮件已提交发送，链接 7 天内有效。','Invitation email submitted for delivery. The link expires in 7 days.')};
 }catch{
  await identityQuery("update tenant_invitations set status='FAILED' where id=$1 and status='PREPARING'",[invite.id]);
  revalidatePath('/admin/accounts');return {ok:false,message:text(l,'邮件发送未确认成功，请检查邮件服务配置后重新发送。','Email delivery was not confirmed. Check the email service configuration and resend.')};
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
