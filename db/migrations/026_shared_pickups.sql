-- Explicit daily sharing; never infer sharing from two routes visiting a school.
create table shared_pickup_members (
 assignment_id uuid not null references trip_students(id) on delete cascade,
 trip_id uuid not null references trips(id) on delete cascade,
 pickup_stop_id uuid not null,
 dropoff_stop_id uuid not null,
 primary key(assignment_id,trip_id)
);
create index shared_pickup_trip_idx on shared_pickup_members(trip_id);
