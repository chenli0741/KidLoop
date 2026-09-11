alter table travel_time_profiles
  add column if not exists origin_dwell_minutes integer not null default 0
  check (origin_dwell_minutes between 0 and 120);
