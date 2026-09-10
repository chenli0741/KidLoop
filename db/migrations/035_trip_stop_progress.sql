alter table trips add column if not exists current_stop_index integer not null default 0;
alter table trips add column if not exists progress_state text not null default 'AT_STOP' check (progress_state in ('AT_STOP','IN_TRANSIT'));
create table if not exists trip_stop_events (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  stop_index integer not null,
  event_type text not null check (event_type in ('GO','ARRIVED','DROP_OFF')),
  actor_id uuid not null references app_users(id),
  operation_location jsonb,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists trip_stop_events_trip_idx on trip_stop_events(trip_id, created_at);
