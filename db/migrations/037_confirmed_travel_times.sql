insert into travel_time_profiles(from_name,to_name,estimated_minutes,notes)
values
  ('McAuliffe','One Stop',10,'用户实测确认'),
  ('One Stop','Stratford',15,'用户确认：不超过 15 分钟'),
  ('Stratford','Morningstar San Jose',10,'用户实测确认'),
  ('Ellis','Little Tree Sunnyvale',10,'用户实测确认')
on conflict (from_name,to_name) do update
set estimated_minutes=excluded.estimated_minutes,
    notes=excluded.notes,
    active=true,
    updated_at=now();
