import "server-only";
import { randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import { tokenHash } from "./password";
import type { AuthUser,UserRole } from "./types";
export type InvitationInput={email:string;name:string;role:string;driverId:string|null;parentId:string|null};
export type Invitation={id:string;tenant_id:string;email:string;name:string;role:UserRole;driver_id:string|null;parent_id:string|null;student_ids:string[];status:string;expires_at:Date;company_name:string};
export async function invitationAdmin(c:PoolClient,user:AuthUser) {
 const r=await c.query(`select u.id from app_users u join tenants t on t.id=u.tenant_id
 join login_accounts a on a.id=u.account_id join user_sessions us on us.user_id=u.id
 join account_sessions s on s.token_hash=us.token_hash and s.account_id=a.id and s.selected_tenant_id=t.id
 where u.id=$1 and u.tenant_id=$2 and u.account_id=$3 and u.role='ADMIN' and u.active and t.active and a.active
 and s.context_key=$4 and s.expires_at>now() and us.expires_at>now() for update of u`,[user.id,user.tenantId,user.accountId,user.contextKey]);
 if(!r.rowCount)throw new Error('forbidden');
}
async function validateLinks(c:PoolClient,tenant:string,role:string,driver:string|null,parent:string|null,students?:string[]) {
 if(role==='DRIVER') {
  const d=(await c.query('select name from drivers where id=$1 and tenant_id=$2 and active for share',[driver,tenant])).rows[0];
  if(!d || (await c.query('select 1 from app_users where tenant_id=$1 and driver_id=$2',[tenant,driver])).rowCount)throw new Error('driver');
  return {name:d.name as string,students:[] as string[]};
 }
 if(role==='PARENT') {
  const p=(await c.query('select name from parents where id=$1 and tenant_id=$2 for share',[parent,tenant])).rows[0];
  const rows=(await c.query('select id from students where parent_id=$1 and tenant_id=$2 and active for share',[parent,tenant])).rows.map(r=>r.id as string);
  if(!p || !rows.length || (students && (!students.length || students.some(s=>!rows.includes(s)))))throw new Error('parent');
  return {name:p.name as string,students:students??rows};
 }
 if(role!=='ADMIN')throw new Error('role');
 return {name:'',students:[] as string[]};
}
export async function prepareInvitation(c:PoolClient,admin:AuthUser,input:InvitationInput) {
 await invitationAdmin(c,admin);
 const email=input.email.trim().toLowerCase();
 if(email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error('email');
 if((await c.query('select 1 from app_users where tenant_id=$1 and email=$2',[admin.tenantId,email])).rowCount)throw new Error('bound');
 const recent=(await c.query("select count(*)::int n from tenant_invitations where tenant_id=$1 and created_at>now()-interval '1 hour'",[admin.tenantId])).rows[0].n;
 if(recent>=100)throw new Error('rate');
 const driver=input.role==='DRIVER'?input.driverId:null,parent=input.role==='PARENT'?input.parentId:null;
 const links=await validateLinks(c,admin.tenantId!,input.role,driver,parent);
 const name=input.role==='ADMIN'?input.name.trim():links.name;
 if(!name || name.length>100)throw new Error('name');
 await c.query("update tenant_invitations set status='REVOKED' where tenant_id=$1 and email=$2 and status in ('PREPARING','SENT')",[admin.tenantId,email]);
 const token=randomBytes(32).toString('hex');
 const row=(await c.query(`insert into tenant_invitations(tenant_id,email,name,role,driver_id,parent_id,student_ids,token_hash,invited_by)
 values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,[admin.tenantId,email,name,input.role,driver,parent,links.students,tokenHash(token),admin.id])).rows[0];
 const company=(await c.query('select name from tenants where id=$1',[admin.tenantId])).rows[0].name;
 return {id:row.id as string,email,name,role:input.role as UserRole,company:String(company),token};
}
export async function readInvitation(c:PoolClient,token:string,lock=false):Promise<Invitation|null> {
 if(!/^[a-f0-9]{64}$/.test(token))return null;
 return (await c.query<Invitation>(`select i.*,t.name company_name from tenant_invitations i join tenants t on t.id=i.tenant_id
 where i.token_hash=$1 and i.status='SENT' and i.expires_at>now() and t.active ${lock?'for update of i':''}`,[tokenHash(token)])).rows[0]??null;
}
export async function acceptInvitation(c:PoolClient,token:string,identity:{accountId:string;sessionHash:string}|null,passwordHash?:string) {
 const invite=await readInvitation(c,token,true);if(!invite)throw new Error('unavailable');
 // Serialize activation/registration for the same email without overwriting credentials.
 await c.query('select pg_advisory_xact_lock(hashtextextended($1,56001))',[invite.email]);
 let account=(await c.query('select id,email,active from login_accounts where email=$1 for update',[invite.email])).rows[0];
 if(account){
  if(!identity || identity.accountId!==account.id || !account.active || !(await c.query('select 1 from account_sessions where token_hash=$1 and account_id=$2 and expires_at>now()',[identity.sessionHash,account.id])).rowCount)throw new Error('signin');
 }else{
  if(identity || !passwordHash)throw new Error('signin');
  account=(await c.query('insert into login_accounts(name,email,password_hash,registration_role) values($1,$2,$3,$4) returning id',[invite.name,invite.email,passwordHash,invite.role])).rows[0];
 }
 if((await c.query('select 1 from app_users where tenant_id=$1 and account_id=$2',[invite.tenant_id,account.id])).rowCount)throw new Error('bound');
 await validateLinks(c,invite.tenant_id,invite.role,invite.driver_id,invite.parent_id,invite.student_ids);
 await c.query("select set_config('kidloop.tenant_id',$1,true)",[invite.tenant_id]);
 const member=(await c.query('insert into app_users(tenant_id,account_id,email,name,role,driver_id) values($1,$2,$3,$4,$5,$6) returning id',[invite.tenant_id,account.id,invite.email,invite.name,invite.role,invite.driver_id])).rows[0];
 for(const student of invite.student_ids)await c.query('insert into user_students(user_id,student_id) values($1,$2)',[member.id,student]);
 await c.query("update tenant_invitations set status='ACCEPTED',accepted_by=$2,accepted_at=now() where id=$1",[invite.id,account.id]);
 await c.query("insert into tenant_audit(tenant_id,account_id,action,details) values($1,$2,'INVITATION_ACCEPTED',$3)",[invite.tenant_id,account.id,JSON.stringify({invitationId:invite.id,memberId:member.id,role:invite.role})]);
 return account.id as string;
}
