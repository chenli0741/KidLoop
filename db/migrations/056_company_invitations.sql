alter table tenants add column contact_name text not null default '',
 add column contact_email text not null default '', add column phone text not null default '',
 add column address text not null default '';
create table tenant_invitations (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references tenants(id),
 email text not null check(email=lower(email)), name text not null,
 role text not null check(role in ('ADMIN','DRIVER','PARENT')),
 driver_id uuid, parent_id uuid, student_ids uuid[] not null default '{}',
 token_hash text not null unique, status text not null default 'PREPARING'
 check(status in ('PREPARING','SENT','FAILED','REVOKED','ACCEPTED')),
 invited_by uuid not null, expires_at timestamptz not null default now()+interval '7 days',
 accepted_by uuid references login_accounts(id), accepted_at timestamptz,
 created_at timestamptz not null default now(), sent_at timestamptz,
 foreign key(tenant_id,invited_by) references app_users(tenant_id,id),
 foreign key(tenant_id,driver_id) references drivers(tenant_id,id),
 foreign key(tenant_id,parent_id) references parents(tenant_id,id),
 check((role='DRIVER' and driver_id is not null and parent_id is null) or
       (role='PARENT' and parent_id is not null and driver_id is null and cardinality(student_ids)>0) or
       (role='ADMIN' and driver_id is null and parent_id is null))
);
create index on tenant_invitations(tenant_id,created_at desc);
create unique index tenant_invitation_pending_email on tenant_invitations(tenant_id,email)
 where status in ('PREPARING','SENT');
revoke all on tenant_invitations from public,kidloop_runtime;
-- Preserve old requests for historical audit; the application no longer accepts them.
