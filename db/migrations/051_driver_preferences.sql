alter table drivers add column latest_dismissal_time time;
alter table drivers add column school_preference_mode text not null default 'NONE'
  check (school_preference_mode in ('NONE','PREFER','ONLY'));
alter table drivers add constraint driver_dismissal_window check
  (earliest_dismissal_time is null or latest_dismissal_time is null or earliest_dismissal_time <= latest_dismissal_time);
create table driver_school_preferences (
 driver_id uuid not null references drivers(id) on delete cascade,
 school_id uuid not null references schools(id) on delete restrict,
 primary key(driver_id,school_id)
);
