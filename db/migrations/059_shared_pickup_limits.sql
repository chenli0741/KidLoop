-- Shared-pickup bounds are an allocation result. Execution reads these values;
-- it must not recalculate them from live rosters or another vehicle's progress.
create table shared_pickup_limits (
 tenant_id uuid not null default current_tenant() references tenants(id),
 trip_id uuid not null,
 pickup_stop_id uuid not null,
 minimum_riders integer not null check(minimum_riders>=0),
 maximum_riders integer not null check(maximum_riders>=0),
 pool_size integer not null check(pool_size>=maximum_riders),
 feasible boolean not null check(not feasible or maximum_riders>=minimum_riders),
 created_at timestamptz not null default now(),
 primary key(tenant_id,trip_id,pickup_stop_id),
 foreign key(tenant_id,trip_id) references trips(tenant_id,id) on delete cascade
);
create index shared_pickup_limits_trip on shared_pickup_limits(tenant_id,trip_id);

-- Backfill already-generated shared trips once. Future rows are written while
-- the schedule is materialized, before any driver starts execution.
do $$
declare pair record; total_riders integer; current_capacity integer; all_capacity integer;
begin
 for pair in
  select distinct tenant_id,trip_id,pickup_stop_id from (
   select ts.tenant_id,ts.trip_id,ts.pickup_stop_id
   from trip_students ts
   where ts.pickup_stop_id is not null and exists(
    select 1 from shared_pickup_members m where m.tenant_id=ts.tenant_id and m.assignment_id=ts.id
   )
   union
   select tenant_id,trip_id,pickup_stop_id from shared_pickup_members
  ) candidates
 loop
  with pool as (
   select distinct ts.id,ts.status
   from trip_students ts
   left join shared_pickup_members target on target.tenant_id=pair.tenant_id
    and target.assignment_id=ts.id and target.trip_id=pair.trip_id and target.pickup_stop_id=pair.pickup_stop_id
   where ts.tenant_id=pair.tenant_id
    and exists(select 1 from shared_pickup_members m where m.tenant_id=ts.tenant_id and m.assignment_id=ts.id)
    and ((ts.trip_id=pair.trip_id and ts.pickup_stop_id=pair.pickup_stop_id) or target.assignment_id is not null)
  ) select count(*) filter(where status not in ('ABSENT','EXCEPTION'))::integer into total_riders from pool;

  with pool as (
   select distinct ts.id
   from trip_students ts
   left join shared_pickup_members target on target.tenant_id=pair.tenant_id
    and target.assignment_id=ts.id and target.trip_id=pair.trip_id and target.pickup_stop_id=pair.pickup_stop_id
   where ts.tenant_id=pair.tenant_id
    and exists(select 1 from shared_pickup_members m where m.tenant_id=ts.tenant_id and m.assignment_id=ts.id)
    and ((ts.trip_id=pair.trip_id and ts.pickup_stop_id=pair.pickup_stop_id) or target.assignment_id is not null)
  ), participants as (
   select ts.trip_id from trip_students ts join pool on pool.id=ts.id where ts.tenant_id=pair.tenant_id
   union
   select m.trip_id from shared_pickup_members m join pool on pool.id=m.assignment_id where m.tenant_id=pair.tenant_id
  ), capacities as (
   select t.id,v.capacity-count(ts.id) filter(where ts.status not in ('ABSENT','EXCEPTION')
    and not exists(select 1 from shared_pickup_members x where x.tenant_id=ts.tenant_id and x.assignment_id=ts.id))::integer as available
   from participants p join trips t on t.tenant_id=pair.tenant_id and t.id=p.trip_id
   join driver_shifts sh on sh.tenant_id=t.tenant_id and sh.id=t.shift_id
   join vehicles v on v.tenant_id=sh.tenant_id and v.id=sh.vehicle_id
   left join trip_students ts on ts.tenant_id=t.tenant_id and ts.trip_id=t.id
   group by t.id,v.capacity
  ) select coalesce(max(available) filter(where id=pair.trip_id),0),coalesce(sum(available),0)
    into current_capacity,all_capacity from capacities;

  if total_riders>0 then
   insert into shared_pickup_limits(tenant_id,trip_id,pickup_stop_id,minimum_riders,maximum_riders,pool_size,feasible)
   values(pair.tenant_id,pair.trip_id,pair.pickup_stop_id,
    greatest(0,total_riders-(all_capacity-current_capacity)),least(total_riders,current_capacity),
    total_riders,all_capacity>=total_riders);
  end if;
 end loop;
end $$;

insert into tenant_tables(table_name) values('shared_pickup_limits');
alter table shared_pickup_limits enable row level security;
create policy tenant_isolation on shared_pickup_limits to kidloop_runtime
 using(tenant_id=current_tenant()) with check(tenant_id=current_tenant());
create policy tenant_guard on shared_pickup_limits as restrictive to kidloop_runtime
 using(tenant_id=current_tenant()) with check(tenant_id=current_tenant());
revoke all on shared_pickup_limits from public,kidloop_runtime;
grant select,insert,update,delete on shared_pickup_limits to kidloop_runtime;
