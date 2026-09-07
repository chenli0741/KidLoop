create table schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text not null,
  pickup_map_url text,
  pickup_instructions text not null default '',
  dismissal_time time not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table after_school_programs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text not null,
  dropoff_info text not null default '',
  requirements text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table classrooms (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (school_id, name)
);

create table parents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  relationship text not null,
  phone text not null,
  backup_phone text,
  email text,
  created_at timestamptz not null default now()
);

create table students (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references classrooms(id),
  parent_id uuid not null references parents(id),
  program_id uuid not null references after_school_programs(id),
  name text not null,
  photo_url text not null,
  grade text not null,
  age integer not null check (age between 3 and 20),
  notes text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table vehicles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plate text not null unique,
  capacity integer not null check (capacity > 0 and capacity <= 100),
  status text not null default 'AVAILABLE' check (status in ('AVAILABLE', 'IN_SERVICE', 'MAINTENANCE')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table drivers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  status text not null default 'AVAILABLE' check (status in ('AVAILABLE', 'OFF_DUTY')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table driver_shifts (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references drivers(id),
  vehicle_id uuid not null references vehicles(id),
  shift_date date not null,
  start_time time not null,
  end_time time not null,
  status text not null default 'SCHEDULED' check (status in ('SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELED')),
  created_at timestamptz not null default now(),
  check (start_time < end_time)
);

create table trips (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references driver_shifts(id),
  school_id uuid not null references schools(id),
  program_id uuid not null references after_school_programs(id),
  scheduled_date date not null,
  departure_time time not null,
  status text not null default 'PUBLISHED' check (status in ('DRAFT', 'PUBLISHED', 'IN_PROGRESS', 'COMPLETED', 'CANCELED', 'NEEDS_ATTENTION')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table trip_students (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  student_id uuid not null references students(id),
  status text not null default 'SCHEDULED' check (status in ('SCHEDULED', 'PICKED_UP', 'DROPPED_OFF', 'ABSENT', 'EXCEPTION')),
  picked_up_at timestamptz,
  dropped_off_at timestamptz,
  notes text not null default '',
  updated_at timestamptz not null default now(),
  unique (trip_id, student_id)
);

create table status_history (
  id uuid primary key default gen_random_uuid(),
  trip_student_id uuid not null references trip_students(id) on delete cascade,
  from_status text,
  to_status text not null,
  note text not null default '',
  created_at timestamptz not null default now()
);

create index driver_shifts_date_idx on driver_shifts (shift_date);
create index trips_date_idx on trips (scheduled_date);
create index trip_students_trip_idx on trip_students (trip_id);
create index students_classroom_idx on students (classroom_id);
