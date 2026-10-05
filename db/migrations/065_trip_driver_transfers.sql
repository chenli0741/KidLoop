create table trip_driver_transfers (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null default current_tenant() references tenants(id),
 trip_id uuid not null,
 from_driver_id uuid not null,
 to_driver_id uuid not null,
 actor_id uuid not null,
 created_at timestamptz not null default now(),
 check(from_driver_id<>to_driver_id),
 foreign key(tenant_id,trip_id) references trips(tenant_id,id) on delete cascade,
 foreign key(tenant_id,from_driver_id) references drivers(tenant_id,id),
 foreign key(tenant_id,to_driver_id) references drivers(tenant_id,id),
 foreign key(tenant_id,actor_id) references app_users(tenant_id,id)
);
create index trip_driver_transfers_trip on trip_driver_transfers(tenant_id,trip_id,created_at desc);
insert into tenant_tables(table_name) values('trip_driver_transfers');
alter table trip_driver_transfers enable row level security;
create policy tenant_isolation on trip_driver_transfers to kidloop_runtime
 using(tenant_id=current_tenant()) with check(tenant_id=current_tenant());
create policy tenant_guard on trip_driver_transfers as restrictive to kidloop_runtime
 using(tenant_id=current_tenant()) with check(tenant_id=current_tenant());
revoke all on trip_driver_transfers from public,kidloop_runtime;
grant select,insert on trip_driver_transfers to kidloop_runtime;
