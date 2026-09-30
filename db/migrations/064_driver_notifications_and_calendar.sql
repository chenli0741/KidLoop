create table driver_push_devices (
 tenant_id uuid not null default current_tenant() references tenants(id),
 user_id uuid not null,
 installation_id uuid not null,
 token text not null,
 environment text not null check(environment in ('sandbox','production')),
 active boolean not null default true,
 last_seen_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 primary key(tenant_id,installation_id),
 unique(token),
 foreign key(tenant_id,user_id) references app_users(tenant_id,id) on delete cascade
);

create table driver_notification_deliveries (
 tenant_id uuid not null default current_tenant() references tenants(id),
 user_id uuid not null,
 installation_id uuid not null,
 notification_key text not null,
 status text not null default 'SENDING' check(status in ('SENDING','SENT','FAILED')),
 attempts integer not null default 1,
 provider_status integer,
 updated_at timestamptz not null default now(),
 primary key(tenant_id,installation_id,notification_key),
 foreign key(tenant_id,user_id) references app_users(tenant_id,id) on delete cascade,
 foreign key(tenant_id,installation_id) references driver_push_devices(tenant_id,installation_id) on delete cascade
);

create table driver_calendar_connections (
 tenant_id uuid not null default current_tenant() references tenants(id),
 user_id uuid not null,
 revision uuid not null default gen_random_uuid(),
 provider_subject text not null,
 email text not null,
 credentials_enc text not null,
 status text not null default 'CONNECTED' check(status in ('CONNECTED','RECONNECT')),
 updated_at timestamptz not null default now(),
 primary key(tenant_id,user_id),
 foreign key(tenant_id,user_id) references app_users(tenant_id,id) on delete cascade
);

create table driver_calendar_oauth_flows (
 state_hash text primary key,
 tenant_id uuid not null references tenants(id),
 user_id uuid not null,
 account_id uuid not null,
 session_hash text not null,
 context_key text not null,
 proof_hash text not null,
 prior_revision uuid,
 native boolean not null default false,
 verifier_enc text not null,
 pending_enc text,
 status text not null default 'PENDING' check(status in ('PENDING','EXCHANGING','READY','FAILED')),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '10 minutes',
 foreign key(tenant_id,user_id) references app_users(tenant_id,id) on delete cascade,
 foreign key(tenant_id,account_id) references app_users(tenant_id,account_id) on delete cascade
);
create index on driver_calendar_oauth_flows(expires_at);
create index on driver_calendar_oauth_flows(tenant_id,user_id,created_at);

create table driver_calendar_events (
 tenant_id uuid not null default current_tenant() references tenants(id),
 user_id uuid not null,
 source_key text not null,
 provider_event_id text not null,
 source_hash text not null,
 service_date date not null,
 updated_at timestamptz not null default now(),
 primary key(tenant_id,user_id,source_key),
 foreign key(tenant_id,user_id) references app_users(tenant_id,id) on delete cascade
);

insert into tenant_tables(table_name) values
 ('driver_push_devices'),('driver_notification_deliveries'),('driver_calendar_connections'),
 ('driver_calendar_oauth_flows'),('driver_calendar_events');

-- Device tokens, OAuth callbacks, credentials and provider event IDs stay on
-- the privileged server connection, matching the connected-mail boundary.
-- Every user-facing service revalidates the authenticated membership and uses
-- explicit tenant predicates before reading or writing these tables.
revoke all on driver_push_devices,driver_notification_deliveries,driver_calendar_connections,
 driver_calendar_oauth_flows,driver_calendar_events from public,kidloop_runtime;
