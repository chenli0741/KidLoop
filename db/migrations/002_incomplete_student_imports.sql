-- Historical rosters may omit age and parent contacts.
alter table students alter column age drop not null;
alter table students alter column parent_id drop not null;
alter table schools alter column dismissal_time drop not null;
