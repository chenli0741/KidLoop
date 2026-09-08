create table reschedule_requests (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references app_users(id),
 operating_term_id uuid not null references operating_terms(id),
 messages jsonb not null default '[]',
 intent jsonb,
 snapshot_hash text,
 result jsonb,
 error text,
 status text not null default 'DRAFT' check(status in ('DRAFT','READY','APPLIED','FAILED')),
 revision integer not null default 0,
 applied_candidate integer,
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp()
);
create index reschedule_requests_owner on reschedule_requests(user_id,created_at desc);
create table reschedule_usage (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null references reschedule_requests(id),
 kind text not null check(kind in ('TEXT','AUDIO')),
 model text not null,
 usage jsonb,
 elapsed_ms integer,
 status text not null,
 estimated_usd numeric,
 price_basis jsonb,
 created_at timestamptz not null default clock_timestamp()
);
