-- A cheap version check lets read-only calendars reuse previews without first
-- loading and hashing the complete scheduling input.
create table schedule_input_revisions (
 tenant_id uuid primary key references tenants(id) on delete cascade,
 revision bigint not null default 1,
 changed_at timestamptz not null default clock_timestamp()
);
insert into schedule_input_revisions(tenant_id) select id from tenants;

alter table schedule_preview_cache add column source_revision bigint not null default 0;

create function bump_schedule_input_revision() returns trigger language plpgsql as $$
declare scoped_tenant uuid:=current_tenant();
begin
 if scoped_tenant is not null then
  insert into schedule_input_revisions(tenant_id,revision) values(scoped_tenant,1)
  on conflict(tenant_id) do update set revision=schedule_input_revisions.revision+1,changed_at=clock_timestamp();
 end if;
 return null;
end $$;

do $$
declare table_name text;
begin
 foreach table_name in array array[
  'schools','after_school_programs','classrooms','students','term_students','school_terms',
  'school_pickup_rules','school_calendar_schedules','school_pickup_batches','fixed_routes',
  'fixed_route_stops','drivers','driver_school_preferences','vehicles','student_day_plans',
  'trips','trip_students','driver_shifts','travel_time_profiles','route_combination_groups',
  'route_combination_group_vehicles','driver_unavailability'
 ] loop
  execute format('create trigger schedule_input_revision after insert or update or delete or truncate on %I for each statement execute function bump_schedule_input_revision()',table_name);
 end loop;
end $$;

insert into tenant_tables(table_name) values('schedule_input_revisions');
alter table schedule_input_revisions enable row level security;
create policy tenant_isolation on schedule_input_revisions to kidloop_runtime
 using(tenant_id=current_tenant()) with check(tenant_id=current_tenant());
create policy tenant_guard on schedule_input_revisions as restrictive to kidloop_runtime
 using(tenant_id=current_tenant()) with check(tenant_id=current_tenant());
revoke all on schedule_input_revisions from public,kidloop_runtime;
grant select,insert,update on schedule_input_revisions to kidloop_runtime;
