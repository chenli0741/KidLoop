-- Rename the existing working term and its matching school-calendar labels.
-- Archived terms and custom school-calendar names are retained.
update school_terms t
set name = 'Fall 2026', updated_at = clock_timestamp()
from operating_terms o
where t.operating_term_id = o.id
  and o.status = 'OPEN'
  and o.starts_on = date '2026-08-20'
  and o.ends_on = date '2026-12-20'
  and o.name = '2026 秋季学期'
  and t.name = '2026 秋季学期';

update operating_terms
set name = 'Fall 2026'
where status = 'OPEN'
  and starts_on = date '2026-08-20'
  and ends_on = date '2026-12-20'
  and name = '2026 秋季学期';
