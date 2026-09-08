alter table students add column school_id uuid references schools(id);
alter table students add column classroom_name text not null default '';
alter table students add column no_pickup_weekdays integer[] not null default '{}'
  check (no_pickup_weekdays <@ array[1,2,3,4,5,6,7] and array_position(no_pickup_weekdays,null) is null);
update students s set school_id=c.school_id,classroom_name=c.name from classrooms c where c.id=s.classroom_id;
alter table students alter column school_id set not null;
alter table students alter column classroom_id drop not null;
create index students_school_id_idx on students(school_id);

-- Preserve compatibility with old import scripts; new writes use school/name directly.
create function student_legacy_classroom() returns trigger language plpgsql as $$
begin
  if new.classroom_id is not null and
    (TG_OP='INSERT' or new.classroom_id is distinct from old.classroom_id) then
    select school_id,name into new.school_id,new.classroom_name from classrooms where id=new.classroom_id;
  end if;
  return new;
end;
$$;
create trigger student_legacy_classroom before insert or update of classroom_id on students
for each row execute function student_legacy_classroom();

alter table term_students add column previous_classroom_name text;
update term_students t set previous_classroom_name=c.name from classrooms c where c.id=t.previous_classroom_id;
