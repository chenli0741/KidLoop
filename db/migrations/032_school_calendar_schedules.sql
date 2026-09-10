-- Calendar entries are planned school schedules, not ad-hoc exceptions.
alter table school_calendar_exceptions rename to school_calendar_schedules;
alter index if exists school_calendar_exceptions_school_idx rename to school_calendar_schedules_school_idx;
create index if not exists school_calendar_schedules_overlap_idx
  on school_calendar_schedules(school_id, starts_on, ends_on);
