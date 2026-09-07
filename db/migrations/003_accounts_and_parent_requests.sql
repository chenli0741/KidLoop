create table app_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email)),
  name text not null,
  password_hash text not null,
  role text not null check (role in ('ADMIN', 'DRIVER', 'PARENT')),
  driver_id uuid unique references drivers(id),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check ((role = 'DRIVER' and driver_id is not null) or (role <> 'DRIVER' and driver_id is null))
);

-- Explicit bindings: matching a name, phone or email never grants child access.
create table user_students (
  user_id uuid not null references app_users(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  primary key (user_id, student_id)
);
create index user_students_student_idx on user_students(student_id);

create table user_sessions (
  token_hash text primary key,
  user_id uuid not null references app_users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index user_sessions_user_idx on user_sessions(user_id);
create index user_sessions_expiry_idx on user_sessions(expires_at);

create table login_limits (
  key_hash text primary key,
  attempts integer not null default 1,
  window_start timestamptz not null default now()
);

-- One shared plan per child/date, including dates without an assigned trip.
create table student_day_plans (
  student_id uuid not null references students(id),
  service_date date not null,
  absent boolean not null default false,
  note text not null default '' check (length(note) <= 1000),
  updated_by uuid not null references app_users(id),
  updated_at timestamptz not null default now(),
  primary key (student_id, service_date)
);
create index student_day_plans_date_idx on student_day_plans(service_date);

create table student_day_plan_history (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id),
  service_date date not null,
  absent boolean not null,
  note text not null,
  actor_id uuid not null references app_users(id),
  created_at timestamptz not null default now()
);

alter table status_history add column actor_id uuid references app_users(id);
alter table trip_students add column parent_absence boolean not null default false;
