alter table app_users add column phone text not null default '';
alter table app_users add column updated_at timestamptz not null default now();
