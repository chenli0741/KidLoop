create table if not exists travel_time_profiles (
  id uuid primary key default gen_random_uuid(),
  from_name text not null,
  to_name text not null,
  estimated_minutes integer not null check (estimated_minutes > 0 and estimated_minutes <= 600),
  buffer_minutes integer not null default 0 check (buffer_minutes >= 0 and buffer_minutes <= 120),
  notes text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(from_name,to_name)
);
insert into travel_time_profiles(from_name,to_name,estimated_minutes,notes)
values ('One Stop','Stratford',15,'运营测试上限：不超过 15 分钟')
on conflict (from_name,to_name) do update set estimated_minutes=excluded.estimated_minutes,notes=excluded.notes,updated_at=now();
