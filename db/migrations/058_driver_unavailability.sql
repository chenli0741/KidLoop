create table driver_unavailability (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null default current_tenant() references tenants(id),
 driver_id uuid not null,
 starts_on date not null,
 ends_on date not null,
 weekdays integer[] not null default array[1,2,3,4,5,6,7],
 unavailable_from time,
 unavailable_to time,
 reason text not null check(length(trim(reason)) between 1 and 200),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check(starts_on <= ends_on),
 check(cardinality(weekdays) between 1 and 7 and weekdays <@ array[1,2,3,4,5,6,7]),
 check((unavailable_from is null and unavailable_to is null) or
       (unavailable_from is not null and unavailable_to is not null and unavailable_from < unavailable_to)),
 foreign key(tenant_id,driver_id) references drivers(tenant_id,id) deferrable initially deferred
);
create index driver_unavailability_lookup on driver_unavailability(tenant_id,driver_id,starts_on,ends_on);
insert into tenant_tables(table_name) values('driver_unavailability');
alter table driver_unavailability enable row level security;
create policy tenant_isolation on driver_unavailability to kidloop_runtime
 using(tenant_id=current_tenant()) with check(tenant_id=current_tenant());
create policy tenant_guard on driver_unavailability as restrictive to kidloop_runtime
 using(tenant_id=current_tenant()) with check(tenant_id=current_tenant());
revoke all on driver_unavailability from public,kidloop_runtime;
grant select,insert,update,delete on driver_unavailability to kidloop_runtime;

