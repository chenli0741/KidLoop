create table fixed_routes (
 id uuid primary key default gen_random_uuid(), name text not null,
 starts_on date not null, ends_on date not null, weekdays integer[] not null,
 driver_id uuid references drivers(id), vehicle_id uuid references vehicles(id),
 enabled boolean not null default false, updated_at timestamptz not null default clock_timestamp(),
 check (starts_on<=ends_on)
);
create table fixed_route_stops (
 id uuid primary key, route_id uuid not null references fixed_routes(id) on delete cascade,
 position integer not null, school_id uuid references schools(id), program_id uuid references after_school_programs(id),
 name text not null, address text not null, arrival_time time not null,
 check (school_id is null or program_id is null), unique(route_id,position)
);
create table fixed_route_students (
 route_id uuid not null references fixed_routes(id) on delete cascade,
 student_id uuid not null references students(id),
 pickup_stop_id uuid not null references fixed_route_stops(id), dropoff_stop_id uuid not null references fixed_route_stops(id),
 primary key(route_id,student_id)
);
alter table trips alter column school_id drop not null;
alter table trips alter column program_id drop not null;
alter table trips add column fixed_route_id uuid references fixed_routes(id);
alter table trips add column route_name text;
alter table trips add column route_stops jsonb;
create unique index trips_fixed_route_date on trips(fixed_route_id,scheduled_date);
alter table trip_students add column pickup_stop_id uuid;
alter table trip_students add column dropoff_stop_id uuid;
create table route_task_issues (
 route_id uuid not null references fixed_routes(id) on delete cascade,
 service_date date not null, message text not null,
 primary key(route_id,service_date)
);
create unique index fixed_routes_name_unique on fixed_routes(lower(name));
