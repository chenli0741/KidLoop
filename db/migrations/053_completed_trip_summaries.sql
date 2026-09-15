-- Completion extraction is deferred until commit so the final GO event is included.
create table completed_trip_summaries (
 trip_id uuid primary key,
 service_date date not null,
 route_id uuid,
 route_name text,
 driver_id uuid not null,
 driver_name text not null,
 vehicle_id uuid not null,
 vehicle_name text not null,
 planned_stops jsonb not null,
 actual_stops jsonb not null,
 rider_count integer not null,
 picked_up_count integer not null,
 dropped_off_count integer not null,
 absent_count integer not null,
 exception_count integer not null,
 actual_started_at timestamptz,
 actual_finished_at timestamptz,
 completion_recorded_at timestamptz not null,
 total_elapsed_minutes numeric,
 quality_flags text[] not null,
 backfilled boolean not null,
 schema_version integer not null default 1,
 extracted_at timestamptz not null default clock_timestamp()
);
create index completed_trip_summary_date on completed_trip_summaries(service_date);
create table completed_trip_legs (
 source_observation_id uuid primary key,
 trip_id uuid not null references completed_trip_summaries(trip_id),
 driver_id uuid not null,
 driver_name text not null,
 vehicle_id uuid not null,
 service_date date not null,
 from_id text,
 to_id text,
 from_name text,
 to_name text,
 departed_at timestamptz not null,
 arrived_at timestamptz not null,
 minutes numeric not null,
 snapshot_backfilled boolean not null
);
create index completed_trip_legs_date on completed_trip_legs(service_date);
create function extract_completed_trip(target uuid, historical boolean default false) returns void language plpgsql as $$
declare
 t record; stop record; stop_rows jsonb:='[]'; arrival timestamptz; departure timestamptz; delivered timestamptz;
 first_departure timestamptz; finished timestamptz; flags text[]:='{}'; counts record;
begin
 select tr.*,sh.driver_id,sh.vehicle_id,d.name as driver_name,v.name as vehicle_name into t
 from trips tr join driver_shifts sh on sh.id=tr.shift_id join drivers d on d.id=sh.driver_id join vehicles v on v.id=sh.vehicle_id
 where tr.id=target and tr.status='COMPLETED';
 if not found or exists(select 1 from completed_trip_summaries where trip_id=target) then return; end if;
 for stop in select value,ordinality::int-1 as idx from jsonb_array_elements(coalesce(t.route_stops,'[]')) with ordinality loop
  select min(occurred_at) filter(where event_type='ARRIVED'),max(occurred_at) filter(where event_type='GO'),max(occurred_at) filter(where event_type='DROP_OFF')
   into arrival,departure,delivered from execution_observations where trip_id=target and stop_index=stop.idx;
  if arrival is null then flags:=array_append(flags,'MISSING_ARRIVAL:'||stop.idx); end if;
  if departure is null then flags:=array_append(flags,'MISSING_DEPARTURE:'||stop.idx); end if;
  if arrival is not null and departure<arrival then flags:=array_append(flags,'INVALID_STOP_ORDER:'||stop.idx); end if;
  stop_rows:=stop_rows||jsonb_build_array(jsonb_build_object('stopIndex',stop.idx,'stopId',stop.value->>'id','name',stop.value->>'name',
   'schoolId',stop.value->>'schoolId','programId',stop.value->>'programId','plannedTime',stop.value->>'time',
   'arrivalDelayMinutes',case when arrival is not null and (stop.value->>'time') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then extract(epoch from (arrival-((t.scheduled_date+(stop.value->>'time')::time) at time zone 'America/Los_Angeles')))/60.0 else null end,
   'arrivedAt',arrival,'departedAt',case when stop.idx<jsonb_array_length(t.route_stops)-1 then departure else null end,
   'finishedAt',case when stop.idx=jsonb_array_length(t.route_stops)-1 then departure else null end,'dropOffAt',delivered,
   'dwellMinutes',case when departure>=arrival then extract(epoch from(departure-arrival))/60.0 else null end));
 end loop;
 select min(occurred_at) into first_departure from execution_observations where trip_id=target and stop_index=0 and event_type='GO';
 select max(occurred_at) into finished from execution_observations where trip_id=target and stop_index=jsonb_array_length(coalesce(t.route_stops,'[]'))-1 and event_type='GO';
 if finished is null then flags:=array_append(flags,'MISSING_FINISH_EVENT'); end if;
 if exists(select 1 from execution_observations where trip_id=target and is_test) then flags:=array_append(flags,'TEST_EVENTS'); end if;
 if exists(select 1 from execution_observations where trip_id=target and actor_role<>'DRIVER') then flags:=array_append(flags,'NON_DRIVER_EVENTS'); end if;
 if historical then flags:=array_append(flags,'HISTORICAL_SNAPSHOT'); end if;
 select count(*) n,count(*) filter(where picked_up_at is not null) picked,count(*) filter(where dropped_off_at is not null) dropped,
 count(*) filter(where status='ABSENT') absent,count(*) filter(where status='EXCEPTION') exceptions into counts from trip_students where trip_id=target;
 insert into completed_trip_summaries(trip_id,service_date,route_id,route_name,driver_id,driver_name,vehicle_id,vehicle_name,planned_stops,actual_stops,rider_count,picked_up_count,dropped_off_count,absent_count,exception_count,actual_started_at,actual_finished_at,completion_recorded_at,total_elapsed_minutes,quality_flags,backfilled)
 values(target,t.scheduled_date,coalesce(t.source_route_id,t.fixed_route_id),t.route_name,t.driver_id,t.driver_name,t.vehicle_id,t.vehicle_name,coalesce(t.route_stops,'[]'),stop_rows,counts.n,counts.picked,counts.dropped,counts.absent,counts.exceptions,first_departure,finished,t.updated_at,
 case when finished>=first_departure then extract(epoch from(finished-first_departure))/60.0 else null end,flags,historical);
 insert into completed_trip_legs select id,trip_id,driver_id,driver_name,vehicle_id,service_date,from_id,to_id,from_name,to_name,departed_at,arrived_at,minutes,snapshot_backfilled from observed_travel_samples where trip_id=target;
end $$;
create function extract_trip_on_completion() returns trigger language plpgsql as $$
begin perform extract_completed_trip(new.id,false); return new; end $$;
create constraint trigger extract_trip_on_completion after update on trips deferrable initially deferred for each row
 when (new.status='COMPLETED' and old.status is distinct from 'COMPLETED') execute function extract_trip_on_completion();
-- Historical summaries are explicitly marked; missing actual timestamps remain NULL.
do $$ declare r record; begin for r in select id from trips where status='COMPLETED' loop perform extract_completed_trip(r.id,true); end loop; end $$;
