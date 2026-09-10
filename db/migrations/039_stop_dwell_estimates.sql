alter table fixed_route_stops add column if not exists dwell_minutes integer not null default 0 check (dwell_minutes between 0 and 120);
