insert into travel_time_profiles(from_name,to_name,estimated_minutes,notes)
values
  ('Cumberland','Cherry Chase',8,'用户确认'),
  ('Cherry Chase','Little Tree Sunnyvale',10,'用户确认')
on conflict (from_name,to_name) do update
set estimated_minutes=excluded.estimated_minutes,
    notes=excluded.notes,
    active=true,
    updated_at=now();
