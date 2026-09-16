-- Portable mail storage: owner_key is supplied by the host application (KidLoop tenant ID).
-- Only server-side authorized adapters may access these tables; no business-role grants.
create table mail_connections (
 owner_key text primary key, provider text not null check(provider='google'),
 revision uuid not null default gen_random_uuid(),
 provider_subject text not null, email text not null,
 credentials_enc text not null,
 status text not null default 'CONNECTED' check(status in ('CONNECTED','RECONNECT')),
 connected_by text not null, updated_at timestamptz not null default now()
);
create table mail_oauth_flows (
 state_hash text primary key, owner_key text not null, actor_id text not null,
 session_hash text not null, context_key text not null, proof_hash text not null,
 prior_revision uuid, native boolean not null default false,
 verifier_enc text not null, pending_enc text,
 status text not null default 'PENDING' check(status in ('PENDING','EXCHANGING','READY','FAILED')),
 created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '10 minutes'
);
create index on mail_oauth_flows(expires_at);
create index on mail_oauth_flows(owner_key,created_at);
create table mail_deliveries (
 owner_key text not null, message_key text not null, connection_revision uuid not null,
 recipient text not null, sender text not null,
 status text not null default 'SENDING' check(status in ('SENDING','SENT','FAILED','UNKNOWN')),
 provider_message_id text, error_code text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 primary key(owner_key,message_key)
);
create index on mail_deliveries(owner_key,created_at desc);
revoke all on mail_connections,mail_oauth_flows,mail_deliveries from public,kidloop_runtime;
