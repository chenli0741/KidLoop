create table trip_segment_completions (
  trip_id uuid not null references trips(id) on delete cascade,
  pickup_stop_id uuid not null,
  dropoff_stop_id uuid not null,
  completed_at timestamptz not null default clock_timestamp(),
  actor_id uuid references app_users(id) on delete set null,
  primary key(trip_id,pickup_stop_id,dropoff_stop_id)
);
