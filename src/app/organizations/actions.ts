"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireIdentity } from "@/lib/identity";
import { requireUser,homeFor } from "@/lib/auth";
import { identityTransaction } from "@/lib/identity-db";
import { selectTenant } from "@/lib/tenant-service";
import { invitationAdmin } from "@/lib/invitations";
import type { FormState } from "@/lib/types";
import { getLocale } from "@/lib/i18n-server";
import { text } from "@/lib/i18n";
export async function enterOrganization(form:FormData) {
 const account=await requireIdentity();
 if(account.tenantId || form.get('identityContext')!==account.contextKey)redirect('/organizations');
 let role;try{role=await identityTransaction(c=>selectTenant(c,account.sessionHash,String(form.get('tenantId')??'')));}catch{redirect('/organizations?unavailable=1');}
 revalidatePath('/','layout');redirect(homeFor(role));
}
export async function saveCompany(_:FormState,form:FormData):Promise<FormState> {
 const admin=await requireUser(['ADMIN'],true),l=await getLocale();
 const name=String(form.get('name')??'').trim(),contact=String(form.get('contact')??'').trim(),email=String(form.get('email')??'').trim().toLowerCase(),phone=String(form.get('phone')??'').trim(),address=String(form.get('address')??'').trim();
 if(!name||name.length>100||!contact||contact.length>100||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!phone||phone.length>80||!address||address.length>500)return {ok:false,message:text(l,'请完整填写公司资料。','Complete all company details.')};
 await identityTransaction(async c=>{await invitationAdmin(c,admin);await c.query('update tenants set name=$2,contact_name=$3,contact_email=$4,phone=$5,address=$6 where id=$1',[admin.tenantId,name,contact,email,phone,address]);});
 revalidatePath('/','layout');return {ok:true,message:text(l,'公司资料已保存。','Company details saved.')};
}
