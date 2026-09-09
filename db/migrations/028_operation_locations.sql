-- Event snapshots, not geofencing or verification. Historical rows stay unknown.
alter table status_history add column operation_location jsonb;
alter table trip_segment_completions add column operation_location jsonb;
