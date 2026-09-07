-- Keep legacy class links for audit; new rules are defined directly by grades.
alter table school_pickup_rules add column grades text[] not null default '{}';
update school_pickup_rules p set grades = array(
  select distinct trim(s.grade)
  from school_pickup_rule_classes pc join students s on s.classroom_id=pc.classroom_id
  where pc.rule_id=p.id and trim(s.grade)<>''
  order by trim(s.grade)
);
-- Rules without known student grades remain visible for administrators to complete.
