"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getIdentity } from "@/lib/identity";
import { identityQuery,identityTransaction } from "@/lib/identity-db";
import { acceptInvitation } from "@/lib/invitations";
import { hashPassword,tokenHash,validPassword } from "@/lib/password";
import { getLocale } from "@/lib/i18n-server";
import { text } from "@/lib/i18n";
import type { FormState } from "@/lib/types";
export async function activateInvitation(_:FormState,form:FormData):Promise<FormState> {
 const l=await getLocale(),identity=await getIdentity(),token=String(form.get('token')??'');
 const fail={ok:false,message:text(l,'无法接受邀请。请确认登录邮箱与邀请一致，或请公司重新发送有效邀请。','Unable to accept. Use the invited email account, or ask the company for a new invitation.')};
 if(!/^[a-f0-9]{64}$/.test(token) || String(form.get('identityContext')??'')!==(identity?.contextKey??''))return fail;
 const ip=(await headers()).get('x-forwarded-for')?.split(',')[0]?.trim()??'unknown';
 const limit=(await identityQuery<{attempts:number}>(`insert into login_limits(key_hash) values($1) on conflict(key_hash) do update set
 attempts=case when login_limits.window_start<now()-interval '15 minutes' then 1 else login_limits.attempts+1 end,
 window_start=case when login_limits.window_start<now()-interval '15 minutes' then now() else login_limits.window_start end returning attempts`,[tokenHash('invitation-activation:'+ip)])).rows[0];
 if(limit.attempts>20)return fail;
 const password=String(form.get('password')??'');
 if(!identity && (!validPassword(password)||password!==form.get('confirmPassword')))return {ok:false,message:text(l,'请输入两次一致的密码（6–128 字符）。','Enter matching passwords (6–128 characters).')};
 try{const passwordHash=identity?undefined:await hashPassword(password);await identityTransaction(c=>acceptInvitation(c,token,identity?{accountId:identity.id,sessionHash:identity.sessionHash}:null,passwordHash));}catch{return fail;}
 revalidatePath('/','layout');redirect('/invite/accepted');
}
