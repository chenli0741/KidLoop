update travel_time_profiles
set estimated_minutes=14,
    notes='测试估算：One Stop 停留后到 Stratford 预计总行驶约 14 分钟，可按实测调整',
    updated_at=now()
where from_name='One Stop' and to_name='Stratford';

update fixed_route_stops s
set dwell_minutes=case s.name
  when 'McAuliffe' then 10
  when 'One Stop' then 1
  when 'Stratford' then 5
  else 0
end
from fixed_routes r
where s.route_id=r.id
  and r.name like 'McAuliffe%Morningstar%'
  and s.name in ('McAuliffe','One Stop','Stratford','Morningstar San Jose');
