-- A student may leave and later rejoin the service without losing history.
-- Periods are inclusive and bounded by the operating term.
create table student_service_periods (
 tenant_id uuid not null default current_tenant() references tenants(id),
 id uuid not null default gen_random_uuid(),
 operating_term_id uuid not null,
 student_id uuid not null,
 starts_on date not null,
 ends_on date not null,
 created_by uuid,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key(tenant_id,id),
 check(starts_on<=ends_on),
 foreign key(tenant_id,operating_term_id) references operating_terms(tenant_id,id) on delete cascade,
 foreign key(tenant_id,student_id) references students(tenant_id,id) on delete cascade,
 foreign key(tenant_id,created_by) references app_users(tenant_id,id)
);
create index student_service_periods_student_dates on student_service_periods(tenant_id,student_id,starts_on,ends_on);

-- Existing term rosters keep their current behavior without manual data entry.
insert into student_service_periods(tenant_id,operating_term_id,student_id,starts_on,ends_on)
select ts.tenant_id,ts.operating_term_id,ts.student_id,t.starts_on,t.ends_on
from term_students ts join operating_terms t on t.tenant_id=ts.tenant_id and t.id=ts.operating_term_id;

-- Every new term membership gets the ordinary full-term period automatically.
-- Admins only edit exceptions, such as a later start or an early departure.
create function initialize_student_service_period() returns trigger language plpgsql as $$
begin
 insert into student_service_periods(tenant_id,operating_term_id,student_id,starts_on,ends_on)
 select new.tenant_id,new.operating_term_id,new.student_id,t.starts_on,t.ends_on
 from operating_terms t where t.tenant_id=new.tenant_id and t.id=new.operating_term_id
 and not exists(select 1 from student_service_periods p where p.tenant_id=new.tenant_id
   and p.operating_term_id=new.operating_term_id and p.student_id=new.student_id);
 return new;
end $$;
create trigger initialize_student_service_period after insert on term_students
 for each row execute function initialize_student_service_period();

insert into tenant_tables(table_name) values('student_service_periods');
alter table student_service_periods enable row level security;
create policy tenant_isolation on student_service_periods to kidloop_runtime
 using(tenant_id=current_tenant()) with check(tenant_id=current_tenant());
create policy tenant_guard on student_service_periods as restrictive to kidloop_runtime
 using(tenant_id=current_tenant()) with check(tenant_id=current_tenant());
revoke all on student_service_periods from public,kidloop_runtime;
grant select,insert,update,delete on student_service_periods to kidloop_runtime;

create trigger schedule_input_revision after insert or update or delete or truncate on student_service_periods
 for each statement execute function bump_schedule_input_revision();
