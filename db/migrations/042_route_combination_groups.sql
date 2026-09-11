create table if not exists route_combination_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 160),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create unique index if not exists route_combination_groups_name_unique
  on route_combination_groups (lower(name));

create table if not exists route_combination_group_stops (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references route_combination_groups(id) on delete cascade,
  school_id uuid references schools(id) on delete cascade,
  program_id uuid references after_school_programs(id) on delete cascade,
  check ((school_id is null) <> (program_id is null))
);

create unique index if not exists route_combination_group_school_unique
  on route_combination_group_stops (group_id, school_id) where school_id is not null;
create unique index if not exists route_combination_group_program_unique
  on route_combination_group_stops (group_id, program_id) where program_id is not null;

create table if not exists route_combination_group_vehicles (
  group_id uuid not null references route_combination_groups(id) on delete cascade,
  vehicle_id uuid not null references vehicles(id) on delete cascade,
  primary key (group_id, vehicle_id)
);

create index if not exists route_combination_group_vehicles_vehicle_idx
  on route_combination_group_vehicles (vehicle_id);

create index if not exists route_combination_group_stops_school_idx
  on route_combination_group_stops (school_id) where school_id is not null;
create index if not exists route_combination_group_stops_program_idx
  on route_combination_group_stops (program_id) where program_id is not null;
