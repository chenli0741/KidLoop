import "server-only";
import type { PoolClient } from "pg";
import type { UserRole } from "./types";
import { institutionAccess } from "./institution-access";

export async function assertInstitutionAccess(c: PoolClient, accountId: string, sessionHash: string, operation: "create" | "join") {
  const account = (await c.query(`select s.selected_tenant_id as "tenantId",a.registration_role as "registrationRole"
    from login_accounts a join account_sessions s on s.account_id=a.id
    where a.id=$1 and s.token_hash=$2 and a.active and s.expires_at>now() for update of a,s`,[accountId,sessionHash])).rows[0];
  if (!account) throw new Error("Institution management unavailable");
  const memberships = (await c.query(`select t.id,u.role,(u.active and t.active) as active
    from app_users u join tenants t on t.id=u.tenant_id where u.account_id=$1 for share of u,t`,[accountId])).rows;
  if (!institutionAccess(account,memberships)[operation]) throw new Error("Institution management unavailable");
  if (account.tenantId && !(await c.query(`select 1 from user_sessions us join app_users u on u.id=us.user_id
    where us.token_hash=$1 and us.expires_at>now() and u.account_id=$2 and u.tenant_id=$3`,[sessionHash,accountId,account.tenantId])).rowCount) throw new Error("Institution management unavailable");
}

export async function createTenant(c: PoolClient, accountId: string, name: string) {
  name = name.trim();
  if (!name || name.length > 100) throw new Error("name");
  const account = (await c.query("select id,email,name from login_accounts where id=$1 and active for update",[accountId])).rows[0];
  if (!account) throw new Error("account");
  const count = (await c.query("select count(*)::int n from app_users where account_id=$1 and role='ADMIN'",[accountId])).rows[0].n;
  if (count >= 20) throw new Error("limit");
  const tenant = (await c.query("insert into tenants(name) values($1) returning id",[name])).rows[0];
  await c.query("select set_config('kidloop.tenant_id',$1,true)",[tenant.id]);
  await c.query("insert into app_users(tenant_id,account_id,email,name,role) values($1,$2,$3,$4,'ADMIN')",[tenant.id,account.id,account.email,account.name]);
  // Seed only product defaults, never another institution's operational configuration.
  await c.query(`insert into student_status_reasons(id,name_zh,name_en,roles) values
    ('ILLNESS','因病缺席','Illness',array['ADMIN','DRIVER','PARENT']),
    ('PARENT_REQUEST','家长请假','Parent request',array['ADMIN','PARENT']),
    ('PICKED_UP_ELSEWHERE','由其他人接走','Picked up elsewhere',array['ADMIN','DRIVER','PARENT']),
    ('KEPT_AT_SCHOOL','被老师留课','Kept at school',array['DRIVER','PARENT']),
    ('OTHER','其他原因','Other reason',array['ADMIN','DRIVER','PARENT'])`);
  await c.query("insert into tenant_audit(tenant_id,account_id,action) values($1,$2,'CREATED')",[tenant.id,accountId]);
  return tenant.id as string;
}

export async function selectTenant(c: PoolClient, sessionHash: string, tenantId: string) {
  const s = (await c.query("select * from account_sessions where token_hash=$1 and expires_at>now() for update",[sessionHash])).rows[0];
  if (!s || s.selected_tenant_id) throw new Error("Sign out before selecting another institution");
  const member = (await c.query(`select u.id,u.role from app_users u join tenants t on t.id=u.tenant_id join login_accounts a on a.id=u.account_id
    where u.account_id=$1 and u.tenant_id=$2 and u.active and t.active and a.active`,[s.account_id,tenantId])).rows[0];
  if (!member) throw new Error("Institution access unavailable");
  await c.query("update account_sessions set selected_tenant_id=$2 where token_hash=$1",[sessionHash,tenantId]);
  await c.query("insert into user_sessions(token_hash,user_id,expires_at,tenant_id) values($1,$2,$3,$4)",[sessionHash,member.id,s.expires_at,tenantId]);
  return member.role as UserRole;
}

export async function requestTenant(c: PoolClient, accountId: string, code: string) {
  if (!/^[a-f0-9]{32}$/.test(code)) throw new Error("code");
  const t = (await c.query("select id from tenants where join_code=$1 and active",[code])).rows[0];
  if (!t) throw new Error("code");
  if ((await c.query("select 1 from app_users where tenant_id=$1 and account_id=$2",[t.id,accountId])).rowCount) throw new Error("Already bound; contact the institution if disabled");
  await c.query(`insert into tenant_join_requests(tenant_id,account_id) values($1,$2)
    on conflict(tenant_id,account_id) do update set status='PENDING',decided_by=null,decided_at=null,created_at=now()
    where tenant_join_requests.status='REJECTED'`,[t.id,accountId]);
}

export async function bindAccount(c: PoolClient, adminId: string, input: {email:string;role:string;driverId:string|null;studentIds:string[];requestId?:string}) {
  const admin = (await c.query("select tenant_id,account_id from app_users where id=$1 and active and role='ADMIN' for update",[adminId])).rows[0];
  if (!admin) throw new Error("admin");
  const account = (await c.query("select id,name,email from login_accounts where email=$1 and active",[input.email.toLowerCase().trim()])).rows[0];
  if (!account || !['ADMIN','DRIVER','PARENT'].includes(input.role)) throw new Error("account");
  if (input.requestId && !(await c.query("select 1 from tenant_join_requests where id=$1 and tenant_id=$2 and account_id=$3 and status='PENDING' for update",[input.requestId,admin.tenant_id,account.id])).rowCount) throw new Error("request");
  const driver = input.role === 'DRIVER' ? input.driverId : null;
  const students = input.role === 'PARENT' ? [...new Set(input.studentIds)] : [];
  if (input.role === 'DRIVER' && (!driver || !(await c.query("select 1 from drivers where id=$1 and tenant_id=$2 and active",[driver,admin.tenant_id])).rowCount)) throw new Error("driver");
  if (students.length && (await c.query("select 1 from students where id=any($1::uuid[]) and tenant_id=$2 and active",[students,admin.tenant_id])).rowCount !== students.length) throw new Error("students");
  await c.query("select set_config('kidloop.tenant_id',$1,true)",[admin.tenant_id]);
  const member = (await c.query(`insert into app_users(tenant_id,account_id,email,name,role,driver_id)
    values($1,$2,$3,$4,$5,$6) returning id`,[admin.tenant_id,account.id,account.email,driver ? null : account.name,input.role,driver])).rows[0];
  for (const student of students) await c.query("insert into user_students(user_id,student_id) values($1,$2)",[member.id,student]);
  await c.query("update tenant_join_requests set status='APPROVED',decided_by=$3,decided_at=now() where tenant_id=$1 and account_id=$2 and status='PENDING'",[admin.tenant_id,account.id,adminId]);
  await c.query("insert into tenant_audit(tenant_id,account_id,action,details) values($1,$2,'MEMBER_BOUND',$3)",[admin.tenant_id,admin.account_id,JSON.stringify({memberId:member.id,role:input.role})]);
  return member.id as string;
}
