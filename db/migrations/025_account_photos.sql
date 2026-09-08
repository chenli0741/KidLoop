alter table drivers add column photo_url text not null default '';
alter table app_users add column photo_url text not null default '';
alter table student_photos add column purpose text not null default 'student' check(purpose in ('student','avatar'));
create or replace function driver_account_identity() returns trigger language plpgsql as $$
begin
  if new.role='DRIVER' then new.name=null; new.phone=null; new.photo_url=''; end if;
  return new;
end $$;
create or replace function invalidate_driver_account_profile() returns trigger language plpgsql as $$
begin
  if new.name is distinct from old.name or new.phone is distinct from old.phone or new.photo_url is distinct from old.photo_url then
    update app_users set updated_at=clock_timestamp() where driver_id=new.id;
  end if;
  return new;
end $$;
