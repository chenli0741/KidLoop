-- The user supplied Lincoln Elementary's 2026–2027 schedule as the
-- Cupertino public-school template for Christa McAuliffe Elementary.
do $$
declare
  target_school_id uuid;
  target_term_id uuid;
begin
  select id into strict target_school_id
  from schools
  where short_name = 'McAuliffe';

  target_term_id := current_operating_term();
  if target_term_id is null then
    raise exception 'An open operating term is required';
  end if;

  if exists (
    select 1
    from pickup_routes pr
    join school_pickup_rules rule on rule.id = pr.rule_id
    where rule.school_id = target_school_id
      and rule.operating_term_id = target_term_id
  ) then
    raise exception 'McAuliffe pickup rules are still referenced by pickup routes';
  end if;

  update school_terms
  set name = '2026–2027 School Year',
      starts_on = '2026-08-13',
      ends_on = '2027-06-04',
      updated_at = clock_timestamp()
  where school_id = target_school_id
    and operating_term_id = target_term_id;

  if not found then
    raise exception 'McAuliffe school term was not found';
  end if;

  delete from school_pickup_rules
  where school_id = target_school_id
    and operating_term_id = target_term_id;

  insert into school_pickup_rules(
    school_id,
    name,
    weekdays,
    pickup_time,
    grades,
    operating_term_id
  )
  values
    (target_school_id, 'TK–G3 Mon, Wed, Thu, Fri', '{1,3,4,5}', '14:15', '{TK,K,1,2,3}', target_term_id),
    (target_school_id, 'G4–G5 Mon, Wed, Thu, Fri', '{1,3,4,5}', '14:45', '{4,5}', target_term_id),
    (target_school_id, 'TK–G5 Tuesday early dismissal', '{2}', '13:40', '{TK,K,1,2,3,4,5}', target_term_id);

  delete from school_calendar_schedules
  where school_id = target_school_id
    and operating_term_id = target_term_id;

  insert into school_calendar_schedules(
    school_id,
    name,
    starts_on,
    ends_on,
    pickup_time,
    grade_times,
    operating_term_id
  )
  values
    (target_school_id, 'First Day of School', '2026-08-13', '2026-08-13', null, '[{"grades":["TK","K","1","2","3"],"time":"14:15"},{"grades":["4","5"],"time":"14:45"}]', target_term_id),
    (target_school_id, 'Labor Day', '2026-09-07', '2026-09-07', null, '[]', target_term_id),
    (target_school_id, 'Minimum Day', '2026-09-18', '2026-09-18', '11:50', '[]', target_term_id),
    (target_school_id, 'Staff Learning Day', '2026-09-21', '2026-09-21', null, '[]', target_term_id),
    (target_school_id, 'Conferences', '2026-10-01', '2026-10-09', '12:50', '[]', target_term_id),
    (target_school_id, 'Staff Learning Day', '2026-10-23', '2026-10-23', null, '[]', target_term_id),
    (target_school_id, 'Veterans Day', '2026-11-11', '2026-11-11', null, '[]', target_term_id),
    (target_school_id, 'Minimum Day', '2026-11-20', '2026-11-20', '11:50', '[]', target_term_id),
    (target_school_id, 'Thanksgiving Break', '2026-11-23', '2026-11-27', null, '[]', target_term_id),
    (target_school_id, 'Minimum Day', '2026-12-11', '2026-12-11', '11:50', '[]', target_term_id),
    (target_school_id, 'Winter Break', '2026-12-21', '2027-01-01', null, '[]', target_term_id),
    (target_school_id, 'MLK Jr Day', '2027-01-18', '2027-01-18', null, '[]', target_term_id),
    (target_school_id, 'Minimum Day', '2027-01-29', '2027-01-29', '11:50', '[]', target_term_id),
    (target_school_id, 'Minimum Day', '2027-02-12', '2027-02-12', '11:50', '[]', target_term_id),
    (target_school_id, 'Mid-Year Break', '2027-02-15', '2027-02-19', null, '[]', target_term_id),
    (target_school_id, 'Minimum Day', '2027-03-19', '2027-03-19', '11:50', '[]', target_term_id),
    (target_school_id, 'Spring Break', '2027-04-12', '2027-04-16', null, '[]', target_term_id),
    (target_school_id, 'Minimum Day', '2027-04-23', '2027-04-23', '11:50', '[]', target_term_id),
    (target_school_id, 'Minimum Day', '2027-05-06', '2027-05-06', '11:50', '[]', target_term_id),
    (target_school_id, 'Staff Learning Day', '2027-05-07', '2027-05-07', null, '[]', target_term_id),
    (target_school_id, 'Memorial Day', '2027-05-31', '2027-05-31', null, '[]', target_term_id),
    (target_school_id, 'Last Day of School', '2027-06-04', '2027-06-04', '11:50', '[]', target_term_id);

  update fixed_route_stops stop
  set arrival_time = '14:15',
      pickup_time = '14:15'
  from fixed_routes route
  where stop.route_id = route.id
    and stop.school_id = target_school_id
    and route.operating_term_id = target_term_id;

  update fixed_routes route
  set updated_at = clock_timestamp()
  where route.operating_term_id = target_term_id
    and exists (
      select 1
      from fixed_route_stops stop
      where stop.route_id = route.id
        and stop.school_id = target_school_id
    );
end
$$;
