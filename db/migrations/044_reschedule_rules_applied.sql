alter table reschedule_requests drop constraint if exists reschedule_requests_status_check;
alter table reschedule_requests add constraint reschedule_requests_status_check
  check (status in ('DRAFT','READY','RULES_APPLIED','APPLIED','FAILED'));
