create table if not exists trip_events (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  event_type text not null check (event_type in ('STARTED')),
  actor_id uuid not null references app_users(id),
  operation_location jsonb,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists trip_events_trip_idx on trip_events(trip_id, created_at);
