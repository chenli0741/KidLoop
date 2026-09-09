-- One authoritative shared roster: the source route's students at school_id.
create table fixed_route_sharing (
 id uuid primary key default gen_random_uuid(),
 operating_term_id uuid not null references operating_terms(id),
 source_route_id uuid not null unique references fixed_routes(id),
 partner_route_id uuid not null unique references fixed_routes(id),
 school_id uuid not null references schools(id),
 check(source_route_id<>partner_route_id)
);
alter table trips add column shared_route_revision text;
