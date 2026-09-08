alter table fixed_routes add column route_type text not null default 'RECURRING'
  check (route_type in ('RECURRING','TEMPORARY'));
