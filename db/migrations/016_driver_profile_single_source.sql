-- Driver identity lives exclusively in drivers. Accounts hold authentication and links.
alter table app_users alter column name drop not null;
alter table app_users alter column phone drop not null;
create function driver_account_identity() returns trigger language plpgsql as $$
begin
  if new.role='DRIVER' then new.name=null; new.phone=null; end if;
  return new;
end $$;
create trigger driver_account_identity before insert or update on app_users
for each row execute function driver_account_identity();
update app_users set name=null,phone=null where role='DRIVER';
alter table app_users add constraint account_identity_source check (
  (role='DRIVER' and name is null and phone is null)
  or (role<>'DRIVER' and name is not null and phone is not null)
);
-- Invalidate open account/profile forms when their referenced identity changes.
-- Only the version changes; no identity fields are copied.
create function invalidate_driver_account_profile() returns trigger language plpgsql as $$
begin
  if new.name is distinct from old.name or new.phone is distinct from old.phone then
    update app_users set updated_at=clock_timestamp() where driver_id=new.id;
  end if;
  return new;
end $$;
create trigger invalidate_driver_account_profile after update on drivers
for each row execute function invalidate_driver_account_profile();
