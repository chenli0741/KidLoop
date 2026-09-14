-- Immutable operational snapshots; survive later route/name changes.
create table execution_observations (
 id uuid primary key default gen_random_uuid(),
 source_event_id uuid not null unique,
 trip_id uuid not null,
 driver_id uuid not null,
 vehicle_id uuid not null,
 driver_name text not null,
 vehicle_name text not null,
 route_id uuid,
 route_name text,
 service_date date not null,
 stop_index integer not null,
 stop_snapshot jsonb not null,
 event_type text not null,
 occurred_at timestamptz not null,
 actor_id uuid not null,
 actor_role text not null,
 is_test boolean not null,
 operation_location jsonb,
 snapshot_backfilled boolean not null default false,
 recorded_at timestamptz not null default clock_timestamp()
);
create index execution_observations_trip_time on execution_observations(trip_id,occurred_at);
create index execution_observations_date on execution_observations(service_date);
create function capture_execution_observation() returns trigger language plpgsql as $$
begin
 insert into execution_observations(source_event_id,trip_id,driver_id,vehicle_id,driver_name,vehicle_name,route_id,route_name,service_date,stop_index,stop_snapshot,event_type,occurred_at,actor_id,actor_role,is_test,operation_location)
 select new.id,t.id,sh.driver_id,sh.vehicle_id,d.name,v.name,coalesce(t.source_route_id,t.fixed_route_id),t.route_name,t.scheduled_date,new.stop_index,coalesce(t.route_stops->new.stop_index,'{}'),new.event_type,new.created_at,new.actor_id,u.role,lower(trim(u.email))='test@test.kidloop.local',new.operation_location
 from trips t join driver_shifts sh on sh.id=t.shift_id join drivers d on d.id=sh.driver_id join vehicles v on v.id=sh.vehicle_id join app_users u on u.id=new.actor_id where t.id=new.trip_id
 on conflict(source_event_id) do nothing;
 return new;
end $$;
create trigger capture_execution_observation after insert on trip_stop_events for each row execute function capture_execution_observation();
-- Preserve actual historical event times; old route snapshots may reflect later edits.
insert into execution_observations(source_event_id,trip_id,driver_id,vehicle_id,driver_name,vehicle_name,route_id,route_name,service_date,stop_index,stop_snapshot,event_type,occurred_at,actor_id,actor_role,is_test,operation_location,snapshot_backfilled)
select e.id,t.id,sh.driver_id,sh.vehicle_id,d.name,v.name,coalesce(t.source_route_id,t.fixed_route_id),t.route_name,t.scheduled_date,e.stop_index,coalesce(t.route_stops->e.stop_index,'{}'),e.event_type,e.created_at,e.actor_id,u.role,lower(trim(u.email))='test@test.kidloop.local',e.operation_location,true
from trip_stop_events e join trips t on t.id=e.trip_id join driver_shifts sh on sh.id=t.shift_id join drivers d on d.id=sh.driver_id join vehicles v on v.id=sh.vehicle_id join app_users u on u.id=e.actor_id;
create view observed_travel_samples as
select g.id,g.trip_id,g.driver_id,g.driver_name,g.vehicle_id,g.service_date,
 g.stop_snapshot->>'name' as from_name,a.stop_snapshot->>'name' as to_name,
 coalesce(g.stop_snapshot->>'schoolId',g.stop_snapshot->>'programId') as from_id,
 coalesce(a.stop_snapshot->>'schoolId',a.stop_snapshot->>'programId') as to_id,
 g.occurred_at as departed_at,a.occurred_at as arrived_at,
 extract(epoch from (a.occurred_at-g.occurred_at))/60.0 as minutes,
 g.snapshot_backfilled or a.snapshot_backfilled as snapshot_backfilled
from execution_observations g
join lateral(select x.* from execution_observations x where x.trip_id=g.trip_id and x.occurred_at>g.occurred_at and x.event_type in ('GO','ARRIVED') order by x.occurred_at,x.id limit 1) a on a.event_type='ARRIVED' and a.stop_index=g.stop_index+1
where g.event_type='GO' and g.actor_role='DRIVER' and a.actor_role='DRIVER' and not g.is_test and not a.is_test
 and g.driver_id=a.driver_id and g.vehicle_id=a.vehicle_id
 and (g.occurred_at at time zone 'America/Los_Angeles')::date=g.service_date
 and (a.occurred_at at time zone 'America/Los_Angeles')::date=g.service_date
 and extract(epoch from (a.occurred_at-g.occurred_at)) between 60 and 21600;
