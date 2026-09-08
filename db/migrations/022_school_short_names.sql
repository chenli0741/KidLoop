-- Full legal/display name stays in name; ordinary screens prefer short_name.
alter table schools add column short_name text;
alter table schools add constraint school_short_name_valid
  check (short_name is null or (short_name = btrim(short_name) and length(short_name) between 1 and 80));
