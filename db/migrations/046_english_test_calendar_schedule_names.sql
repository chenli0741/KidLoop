update school_calendar_schedules
set name = case name
  when '调整放学时间' then 'Adjusted dismissal time'
  when '早放学 · 11:35' then 'Early dismissal · 11:35'
end,
updated_at = now()
where name in ('调整放学时间', '早放学 · 11:35');
