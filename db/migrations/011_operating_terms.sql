create table operating_terms (
 id uuid primary key default gen_random_uuid(), name text not null,
 starts_on date not null, ends_on date not null,
 status text not null default 'OPEN' check(status in ('OPEN','ARCHIVED')),
 created_at timestamptz not null default now(), archived_at timestamptz,
 snapshot jsonb, check(ends_on>=starts_on and ends_on-starts_on<=550)
);
create unique index one_open_operating_term on operating_terms(status) where status='OPEN';
create function current_operating_term() returns uuid language sql stable as $$select id from operating_terms where status='OPEN'$$;
alter table school_terms add column operating_term_id uuid default current_operating_term() references operating_terms(id);
alter table school_calendar_exceptions add column operating_term_id uuid default current_operating_term() references operating_terms(id);
alter table school_pickup_rules add column operating_term_id uuid default current_operating_term() references operating_terms(id);
alter table fixed_routes add column operating_term_id uuid default current_operating_term() references operating_terms(id);
alter table trips add column operating_term_id uuid default current_operating_term() references operating_terms(id);
create table term_students (
 operating_term_id uuid not null references operating_terms(id), student_id uuid not null references students(id),
 reviewed boolean not null default false, previous_grade text, previous_classroom_id uuid,
 primary key(operating_term_id,student_id)
);
-- Adopt only the latest existing term for each school; retain older records unmodified.
insert into operating_terms(name,starts_on,ends_on)
select '2026 秋季学期',min(starts_on),max(ends_on) from
 (select distinct on(school_id) starts_on,ends_on from school_terms order by school_id,ends_on desc) latest
having count(*)>0 and max(ends_on)-min(starts_on)<=550;
update school_terms set operating_term_id=current_operating_term() where id in
 (select distinct on(school_id) id from school_terms order by school_id,ends_on desc);
update school_pickup_rules set operating_term_id=current_operating_term();
update school_calendar_exceptions set operating_term_id=current_operating_term() where exists
 (select 1 from operating_terms o where o.status='OPEN' and starts_on<=school_calendar_exceptions.ends_on and ends_on>=school_calendar_exceptions.starts_on);
update fixed_routes set operating_term_id=current_operating_term();
update trips set operating_term_id=current_operating_term() where exists
 (select 1 from operating_terms o where o.status='OPEN' and trips.scheduled_date between o.starts_on and o.ends_on);
insert into term_students select current_operating_term(),id,true,grade,classroom_id from students where active and current_operating_term() is not null;
create unique index one_school_term_per_operation on school_terms(operating_term_id,school_id) where operating_term_id is not null;
drop index fixed_routes_name_unique;
create unique index fixed_routes_name_per_term on fixed_routes(operating_term_id,lower(name));
create index trips_operating_term on trips(operating_term_id,scheduled_date);
