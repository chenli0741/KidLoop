-- School calendars and recurring pickup rules are independent of dispatch.
create table school_terms (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id),
  name text not null,
  starts_on date not null,
  ends_on date not null,
  updated_at timestamptz not null default now(),
  check (ends_on >= starts_on and ends_on - starts_on <= 550)
);
create index school_terms_school_idx on school_terms(school_id);
create table school_calendar_exceptions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id),
  name text not null,
  starts_on date not null,
  ends_on date not null,
  pickup_time time,
  updated_at timestamptz not null default now(),
  check (ends_on >= starts_on and ends_on - starts_on <= 550)
);
-- Null time means no pickup. A time overrides all class times on those dates.
create index school_calendar_exceptions_school_idx on school_calendar_exceptions(school_id);
create table school_pickup_rules (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id),
  name text not null,
  weekdays integer[] not null check (cardinality(weekdays)>0 and weekdays <@ array[1,2,3,4,5,6,7]),
  pickup_time time not null,
  updated_at timestamptz not null default now()
);
create table school_pickup_rule_classes (
  rule_id uuid not null references school_pickup_rules(id) on delete cascade,
  classroom_id uuid not null references classrooms(id),
  primary key(rule_id,classroom_id)
);
create table pickup_routes (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references school_pickup_rules(id),
  program_id uuid not null references after_school_programs(id),
  name text not null,
  weekdays integer[] not null check (cardinality(weekdays)>0 and weekdays <@ array[1,2,3,4,5,6,7]),
  updated_at timestamptz not null default now(),
  unique(rule_id,program_id)
);
