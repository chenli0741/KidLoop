update travel_time_profiles
set notes = case notes
  when '用户确认' then 'User confirmed.'
  when '用户实测确认' then 'Confirmed by user testing.'
  when '测试估算：One Stop 停留后到 Stratford 预计总行驶约 14 分钟，可按实测调整'
    then 'Test estimate: about 14 minutes of driving from One Stop to Stratford after the stop; adjust based on measured time.'
end,
updated_at = now()
where notes in (
  '用户确认',
  '用户实测确认',
  '测试估算：One Stop 停留后到 Stratford 预计总行驶约 14 分钟，可按实测调整'
);

update fixed_routes
set notes = case name
  when 'Cumberland → Cherry Chase → Little Tree Sunnyvale'
    then 'Weekday Route 1 draft. Lina normally uses Little Tree 1 for sequential pickups; the exact start time, pickup batches, and capacity plan still need confirmation. Cumberland → Cherry Chase → Little Tree Sunnyvale. Friday early pickup uses a separate Friday early pickup route. Unassigned students are flagged during the daily pickup review.'
  when 'Cumberland → Ellis → Little Tree Sunnyvale'
    then 'Weekday Route 2 draft. Lina normally uses Little Tree 1 for sequential pickups; the exact start time, pickup batches, and capacity plan still need confirmation. Friday dual-vehicle early pickup uses separate Friday early pickup routes. Unassigned students are flagged during the daily pickup review.'
end,
updated_at = now()
where name in (
  'Cumberland → Cherry Chase → Little Tree Sunnyvale',
  'Cumberland → Ellis → Little Tree Sunnyvale'
)
and notes ~ '[一-龥]';

update vehicles
set name = 'One Stop Line',
    updated_at = now()
where name = 'One Stop线';
