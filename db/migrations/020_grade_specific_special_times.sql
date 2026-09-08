alter table school_calendar_exceptions add column grade_times jsonb not null default '[]'
  check (jsonb_typeof(grade_times)='array');

create function school_special_pickup_time(overrides jsonb, grade text, school_time time, regular_time time)
returns time language sql immutable as $$
  select coalesce((select (item->>'time')::time from jsonb_array_elements(overrides) item where item->'grades' ? trim(grade) limit 1),school_time,regular_time)
$$;
