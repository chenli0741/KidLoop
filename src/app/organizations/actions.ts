"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireIdentity } from "@/lib/identity";
import { requireUser, homeFor } from "@/lib/auth";
import { identityTransaction } from "@/lib/identity-db";
import { createTenant, requestTenant, selectTenant } from "@/lib/tenant-service";
import type { FormState } from "@/lib/types";
import { getLocale } from "@/lib/i18n-server";
import { text } from "@/lib/i18n";
export async function createOrganization(_:FormState, form:FormData):Promise<FormState> {
  const account=await requireIdentity(), l=await getLocale();
  if(form.get("identityContext")!==account.contextKey)return {ok:false,message:text(l,"登录已改变，请刷新后重试。","Your login changed. Reload and retry.")};
  let role;
  try {
    role=await identityTransaction(async c=>{
      const id=await createTenant(c,account.id,String(form.get('name')??''));
      return account.tenantId ? null : selectTenant(c,account.sessionHash,id);
    });
  } catch { return {ok:false,message:text(l,"创建失败，请检查名称后重试。","Could not create the institution. Check its name and retry.")}; }
  if(role) {revalidatePath("/","layout"); redirect(homeFor(role));}
  revalidatePath('/organizations');
  return {ok:true,message:text(l,"机构已创建。退出后重新登录，可选择进入新机构。","Institution created. Sign out and sign in to select it.")};
}
export async function joinOrganization(_:FormState,form:FormData):Promise<FormState> {
  const account=await requireIdentity(),l=await getLocale();
  if(form.get("identityContext")!==account.contextKey)return {ok:false,message:text(l,"登录已改变，请刷新后重试。","Your login changed. Reload and retry.")};
  try { await identityTransaction(c=>requestTenant(c,account.id,String(form.get('code')??'').trim().toLowerCase())); }
  catch { return {ok:false,message:text(l,"申请失败，请检查机构代码。如果已绑定，请联系机构管理员。","Could not request access. Check the institution code; if already bound, contact its administrator.")}; }
  revalidatePath('/organizations');
  return {ok:true,message:text(l,"申请已提交，等待机构管理员批准。","Request submitted. Waiting for institution approval.")};
}
export async function enterOrganization(form:FormData) {
  const account=await requireIdentity();
  if(account.tenantId || form.get('identityContext')!==account.contextKey) redirect('/organizations');
  let role;
  try {role=await identityTransaction(c=>selectTenant(c,account.sessionHash,String(form.get('tenantId')??'')));}
  catch { redirect('/organizations?unavailable=1'); }
  revalidatePath("/","layout");
  redirect(homeFor(role));
}
export async function renameOrganization(_:FormState,form:FormData):Promise<FormState> {
  const admin=await requireUser(['ADMIN'], true),l=await getLocale();
  const name=String(form.get('name')??'').trim();
  if(!name||name.length>100)return {ok:false,message:text(l,"名称需 1–100 字符。","Name must contain 1–100 characters.")};
  await identityTransaction(async c=>{
    const allowed=await c.query("select 1 from app_users where id=$1 and tenant_id=$2 and active and role='ADMIN' for update",[admin.id,admin.tenantId]);
    if(!allowed.rowCount)throw new Error('forbidden');
    await c.query('update tenants set name=$2 where id=$1',[admin.tenantId,name]);
    await c.query("insert into tenant_audit(tenant_id,account_id,action,details) values($1,$2,'RENAMED',$3)",[admin.tenantId,admin.accountId,JSON.stringify({name})]);
  });
  revalidatePath('/','layout');
  return {ok:true,message:text(l,"机构名称已保存。","Institution name saved.")};
}
export async function rejectJoinRequest(form:FormData) {
  const admin=await requireUser(['ADMIN'], true);
  await identityTransaction(async c=>{
    const allowed=await c.query("select 1 from app_users where id=$1 and tenant_id=$2 and active and role='ADMIN' for update",[admin.id,admin.tenantId]);
    if(!allowed.rowCount)throw new Error('forbidden');
    const changed=await c.query("update tenant_join_requests set status='REJECTED',decided_by=$3,decided_at=now() where id=$1 and tenant_id=$2 and status='PENDING' returning id",[form.get('requestId'),admin.tenantId,admin.id]);
    if(changed.rowCount)await c.query("insert into tenant_audit(tenant_id,account_id,action,details) values($1,$2,'REQUEST_REJECTED',$3)",[admin.tenantId,admin.accountId,JSON.stringify({requestId:form.get('requestId')})]);
  });
  revalidatePath('/organizations');
}
