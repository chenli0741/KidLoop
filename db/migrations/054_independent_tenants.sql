-- Preserve legacy IDs and facts; all existing operational data belongs to the first provider.
create table tenants (
 id uuid primary key default gen_random_uuid(),
 name text not null check(length(trim(name)) between 1 and 100),
 join_code text not null unique default replace(gen_random_uuid()::text,'-',''),
 active boolean not null default true,
 created_at timestamptz not null default now()
);
insert into tenants(id,name) values('00000000-0000-4000-8000-000000000001','KidLoop 接送服务');
create function current_tenant() returns uuid language sql stable as $$
 select nullif(current_setting('kidloop.tenant_id',true),'')::uuid
$$;

-- Keep an explicit inventory: a new business table must opt in via a migration.
create table tenant_tables(table_name text primary key);
insert into tenant_tables select tablename from pg_tables where schemaname=current_schema()
 and tablename not in ('tenants','tenant_tables','kidloop_migrations','login_limits');
do $$ declare t record; begin
 for t in select table_name from tenant_tables loop
  execute format('alter table %I add column tenant_id uuid references tenants(id)',t.table_name);
  execute format('update %I set tenant_id=$1',t.table_name) using '00000000-0000-4000-8000-000000000001'::uuid;
  execute format('alter table %I alter column tenant_id set not null, alter column tenant_id set default current_tenant()',t.table_name);
  execute format('create index on %I(tenant_id)',t.table_name);
 end loop;
end $$;

-- Logins are global; app_users now represents an institution membership, retaining historic actor IDs.
create table login_accounts (
 id uuid primary key default gen_random_uuid(), email text not null unique check(email=lower(email)),
 name text not null, password_hash text not null, active boolean not null default true,
 created_at timestamptz not null default now()
);
insert into login_accounts(id,email,name,password_hash,active)
 select u.id,u.email,coalesce(u.name,d.name,'KidLoop user'),u.password_hash,true from app_users u left join drivers d on d.id=u.driver_id;
alter table app_users add column account_id uuid references login_accounts(id);
update app_users set account_id=id;
alter table app_users alter column account_id set not null;
alter table app_users drop constraint app_users_email_key;
alter table app_users add unique(tenant_id,email), add unique(tenant_id,account_id);
-- No reusable global credentials exposed to an institution.
update app_users set password_hash='GLOBAL_ACCOUNT';
alter table app_users alter column password_hash set default 'GLOBAL_ACCOUNT';
create table account_sessions (
 token_hash text primary key, account_id uuid not null references login_accounts(id),
 selected_tenant_id uuid references tenants(id), context_key uuid not null default gen_random_uuid(), expires_at timestamptz not null,
 created_at timestamptz not null default now()
);
insert into account_sessions(token_hash,account_id,selected_tenant_id,expires_at)
 select s.token_hash,u.account_id,u.tenant_id,s.expires_at from user_sessions s join app_users u on u.id=s.user_id;
create index account_sessions_account on account_sessions(account_id);
create table tenant_join_requests (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references tenants(id),
 account_id uuid not null references login_accounts(id),
 status text not null default 'PENDING' check(status in ('PENDING','APPROVED','REJECTED')),
 decided_by uuid references app_users(id), created_at timestamptz not null default now(), decided_at timestamptz,
 unique(tenant_id,account_id)
);
create table tenant_audit (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references tenants(id),
 account_id uuid not null references login_accounts(id), action text not null,
 details jsonb not null default '{}',created_at timestamptz not null default now()
);

-- Named reasons and operational uniqueness belong to each provider.
alter table status_history drop constraint status_history_reason_id_fkey;
alter table student_status_reasons drop constraint student_status_reasons_pkey;
alter table student_status_reasons add primary key(tenant_id,id);
alter table status_history add foreign key(tenant_id,reason_id) references student_status_reasons(tenant_id,id);
alter table vehicles drop constraint vehicles_plate_key;
alter table vehicles add unique(tenant_id,plate);
alter table travel_time_profiles drop constraint travel_time_profiles_from_name_to_name_key;
alter table travel_time_profiles add unique(tenant_id,from_name,to_name);
drop index one_open_operating_term;
create unique index one_open_operating_term on operating_terms(tenant_id) where status='OPEN';
drop index route_combination_groups_name_unique;
create unique index route_combination_groups_name_unique on route_combination_groups(tenant_id,lower(name));
create or replace function current_operating_term() returns uuid language sql stable as $$
 select id from operating_terms where status='OPEN' and tenant_id=current_tenant()
$$;

-- Database foreign keys enforce tenant equality, including children and historical actors.
do $$ declare f record; cols text; refs text; begin
 for f in select c.*,r.relname as source,n.relname as target from pg_constraint c
 join pg_class r on r.oid=c.conrelid join pg_class n on n.oid=c.confrelid
 where c.contype='f' and r.relnamespace=current_schema()::regnamespace
 and r.relname in(select table_name from tenant_tables)
 and n.relname in(select table_name from tenant_tables)
 and not exists(select 1 from unnest(c.conkey) k join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k where a.attname='tenant_id') loop
  select string_agg(quote_ident(a.attname),',' order by k.ord) into cols from unnest(f.conkey) with ordinality k(num,ord) join pg_attribute a on a.attrelid=f.conrelid and a.attnum=k.num;
  select string_agg(quote_ident(a.attname),',' order by k.ord) into refs from unnest(f.confkey) with ordinality k(num,ord) join pg_attribute a on a.attrelid=f.confrelid and a.attnum=k.num;
  execute format('create unique index if not exists %I on %I(tenant_id,%s)','tenant_ref_'||substr(md5(f.target||':'||refs),1,24),f.target,refs);
  execute format('alter table %I add constraint %I foreign key(tenant_id,%s) references %I(tenant_id,%s) deferrable initially deferred',f.source,'tenant_fk_'||f.oid,cols,f.target,refs);
 end loop;
end $$;

-- Ordinary SQL runs under a non-owner, non-bypass role, never under the migration owner.
do $$ begin
 if not exists(select 1 from pg_roles where rolname='kidloop_runtime') then create role kidloop_runtime nologin noinherit nosuperuser nobypassrls; end if;
 if exists(select 1 from pg_roles where rolname='kidloop_runtime' and (rolsuper or rolbypassrls or rolcreaterole or rolcreatedb or rolcanlogin or rolinherit)) then raise exception 'Unsafe runtime role'; end if;
 execute format('grant kidloop_runtime to %I',current_user);
 execute format('grant usage on schema %I to kidloop_runtime',current_schema());
end $$;
do $$ declare t record; begin
 for t in select table_name from tenant_tables loop
  execute format('alter table %I enable row level security',t.table_name);
  execute format('create policy tenant_isolation on %I to kidloop_runtime using(tenant_id=current_tenant()) with check(tenant_id=current_tenant())',t.table_name);
  execute format('create policy tenant_guard on %I as restrictive to kidloop_runtime using(tenant_id=current_tenant()) with check(tenant_id=current_tenant())',t.table_name);
  execute format('revoke all on %I from public,kidloop_runtime',t.table_name);
  execute format('grant select,insert,update,delete on %I to kidloop_runtime',t.table_name);
 end loop;
 -- Views must not execute with the migration owner's visibility.
 for t in select viewname from pg_views where schemaname=current_schema() loop
  execute format('alter view %I set(security_invoker=true)',t.viewname);
  execute format('grant select on %I to kidloop_runtime',t.viewname);
 end loop;
end $$;
revoke all on login_accounts,account_sessions,tenants,tenant_join_requests,tenant_tables,login_limits,tenant_audit from public,kidloop_runtime;
revoke insert,update,delete on app_users from kidloop_runtime;
grant update(name,phone,role,driver_id,photo_url,active,updated_at) on app_users to kidloop_runtime;
-- login_limits is a global rate limiter, accessed only by the identity service.

alter table tenant_audit enable row level security;
create policy tenant_audit_scope on tenant_audit to kidloop_runtime
 using(tenant_id=current_tenant()) with check(tenant_id=current_tenant());
grant select,insert on tenant_audit to kidloop_runtime;
create function audit_membership_change() returns trigger language plpgsql as $$
declare actor uuid; account uuid;
begin
 if (old.role,old.active,old.driver_id) is distinct from (new.role,new.active,new.driver_id) then
  actor:=nullif(current_setting('kidloop.actor_id',true),'')::uuid;
  select account_id into account from app_users where id=actor and tenant_id=new.tenant_id;
  if account is not null then
   insert into tenant_audit(tenant_id,account_id,action,details) values(new.tenant_id,account,'MEMBERSHIP_CHANGED',
    jsonb_build_object('memberId',new.id,'oldRole',old.role,'role',new.role,'active',new.active,'driverId',new.driver_id));
  end if;
 end if;
 return new;
end $$;
create trigger audit_membership after update on app_users for each row execute function audit_membership_change();
