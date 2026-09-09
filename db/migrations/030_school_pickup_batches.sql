-- One shared policy per school dismissal batch. Route rosters become derived data.
create table school_pickup_batches (
 id uuid primary key default gen_random_uuid(),
 operating_term_id uuid not null references operating_terms(id),
 school_id uuid not null references schools(id),
 pickup_time time not null,
 weekday integer not null check(weekday between 1 and 7),
 shared boolean not null default false,
 excluded_student_ids uuid[] not null default '{}',
 updated_at timestamptz not null default clock_timestamp(),
 unique(operating_term_id,school_id,pickup_time,weekday)
);
alter table fixed_routes add column excluded_student_ids uuid[] not null default '{}';
alter table fixed_route_stops add column pickup_time time;
-- Select the existing dismissal batch nearest the saved arrival, not the arrival itself.
update fixed_route_stops s set pickup_time=(select p.pickup_time from school_pickup_rules p join fixed_routes r on r.id=s.route_id
 where p.operating_term_id=r.operating_term_id and p.school_id=s.school_id and p.weekdays && r.weekdays
 order by abs(extract(epoch from (p.pickup_time-s.arrival_time))),p.pickup_time limit 1) where s.school_id is not null and s.arrival_time is not null;
insert into school_pickup_batches(operating_term_id,school_id,pickup_time,weekday,shared)
 select distinct g.operating_term_id,g.school_id,s.pickup_time,d,true from fixed_route_sharing g
 join fixed_routes r on r.id=g.source_route_id join fixed_route_stops s on s.route_id=r.id and s.school_id=g.school_id
 cross join lateral unnest(r.weekdays) d where s.pickup_time is not null
 on conflict(operating_term_id,school_id,pickup_time,weekday) do update set shared=true;
-- Preserve deliberate legacy omissions as exclusions; newly enrolled children are automatic.
update fixed_routes r set excluded_student_ids=coalesce((select array_agg(distinct st.id) from students st
 join term_students ts on ts.student_id=st.id and ts.operating_term_id=r.operating_term_id
 join fixed_route_stops s on s.route_id=r.id and s.school_id=st.school_id
 join school_pickup_rules p on p.operating_term_id=r.operating_term_id and p.school_id=st.school_id and trim(st.grade)=any(p.grades) and p.weekdays && r.weekdays and p.pickup_time=s.pickup_time
 where st.active and exists(select 1 from fixed_route_stops dest where dest.route_id=r.id and dest.position>s.position and dest.program_id=st.program_id)
 and not exists(select 1 from fixed_route_students a where a.route_id=r.id and a.student_id=st.id)), '{}');
update school_pickup_batches b set excluded_student_ids=coalesce((select array_agg(distinct x) from fixed_route_sharing g
 join fixed_routes r on r.id=g.source_route_id cross join lateral unnest(r.excluded_student_ids) x join students st on st.id=x
 where g.operating_term_id=b.operating_term_id and g.school_id=b.school_id and st.school_id=b.school_id), '{}');
create table schedule_preview_cache (
 operating_term_id uuid not null references operating_terms(id),service_date date not null,
 revision text not null,payload jsonb not null,checked_at timestamptz not null default clock_timestamp(),
 primary key(operating_term_id,service_date)
);
