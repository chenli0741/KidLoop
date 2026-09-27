-- Record completed daily generation even when the correct result has no trips.
-- Reads can then distinguish "not generated" from "generated empty".
create table schedule_materializations (
 tenant_id uuid not null default current_tenant() references tenants(id),
 operating_term_id uuid not null,
 service_date date not null,
 completed_at timestamptz not null default clock_timestamp(),
 primary key(tenant_id,operating_term_id,service_date),
 foreign key(tenant_id,operating_term_id) references operating_terms(tenant_id,id) on delete cascade
);
create index schedule_materializations_date on schedule_materializations(tenant_id,service_date);

insert into schedule_materializations(tenant_id,operating_term_id,service_date,completed_at)
 select tenant_id,operating_term_id,scheduled_date,max(updated_at) from trips
 where fixed_route_id is not null or generated_plan_id is not null
 group by tenant_id,operating_term_id,scheduled_date
 on conflict do nothing;

insert into tenant_tables(table_name) values('schedule_materializations');
alter table schedule_materializations enable row level security;
create policy tenant_isolation on schedule_materializations to kidloop_runtime
 using(tenant_id=current_tenant()) with check(tenant_id=current_tenant());
create policy tenant_guard on schedule_materializations as restrictive to kidloop_runtime
 using(tenant_id=current_tenant()) with check(tenant_id=current_tenant());
revoke all on schedule_materializations from public,kidloop_runtime;
grant select,insert,update,delete on schedule_materializations to kidloop_runtime;
