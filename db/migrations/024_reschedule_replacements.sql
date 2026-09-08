-- Provenance for replacing an unstarted temporary route. It does not add an
-- operational priority: disabled sources hand their existing assignments to
-- their explicitly recorded replacements, preserving student history IDs.
create table reschedule_route_replacements (
 request_id uuid not null references reschedule_requests(id),
 source_route_id uuid not null references fixed_routes(id),
 target_route_id uuid not null references fixed_routes(id),
 created_at timestamptz not null default clock_timestamp(),
 primary key(source_route_id,target_route_id),
 check(source_route_id<>target_route_id)
);
create index reschedule_route_replacements_target on reschedule_route_replacements(target_route_id);
