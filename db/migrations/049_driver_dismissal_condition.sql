-- Local operations time; NULL means no dismissal-time restriction.
alter table drivers add column earliest_dismissal_time time;
comment on column drivers.earliest_dismissal_time is 'Earliest permitted actual school dismissal time (America/Los_Angeles), inclusive; NULL means unrestricted.';
