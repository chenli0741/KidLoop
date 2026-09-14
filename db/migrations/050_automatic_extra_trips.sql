-- An automatic extra trip references its normal route without editing that template.
alter table trips add column source_route_id uuid references fixed_routes(id);
alter table trips add column generated_plan_id uuid;
alter table trips add column assignment_reason text;
alter table trips add constraint trips_generated_plan_source check (
  (generated_plan_id is null and source_route_id is null) or
  (generated_plan_id is not null and source_route_id is not null and fixed_route_id is null)
);
create unique index trips_generated_plan_date on trips(generated_plan_id,scheduled_date) where generated_plan_id is not null;
create index trips_source_route on trips(source_route_id) where source_route_id is not null;
