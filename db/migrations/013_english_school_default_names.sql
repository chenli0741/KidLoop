-- English names for known default school data; preserve archived and custom records.

update school_calendar_exceptions r
set name = names.english, updated_at = clock_timestamp()
from (values
  ('元旦 / New Year', 'New Year'),
  ('六月节 / Juneteenth', 'Juneteenth'),
  ('独立日 / Independence Day', 'Independence Day'),
  ('退伍军人节 / Veterans Day', 'Veterans Day'),
  ('圣诞节 / Christmas', 'Christmas'),
  ('马丁·路德·金纪念日 / MLK Day', 'MLK Day'),
  ('华盛顿诞辰 / Washington''s Birthday', 'Washington''s Birthday'),
  ('华盛顿诞辰日 / Washington''s Birthday', 'Washington''s Birthday'),
  ('劳动节 / Labor Day', 'Labor Day'),
  ('哥伦布日 / Columbus Day', 'Columbus Day'),
  ('感恩节 / Thanksgiving', 'Thanksgiving'),
  ('阵亡将士纪念日 / Memorial Day', 'Memorial Day'),
  ('独立日（含补休）/ Independence Day', 'Independence Day (including observed holiday)'),
  ('六月节（含补休）/ Juneteenth', 'Juneteenth (including observed holiday)'),
  ('圣诞节（含补休）/ Christmas', 'Christmas (including observed holiday)'),
  ('2028 元旦补休 / New Year observed', 'New Year 2028 (observed)')
) as names(original, english)
where r.name = names.original
  and (r.operating_term_id is null or r.operating_term_id = current_operating_term());

update school_pickup_rules r
set name = names.english, updated_at = clock_timestamp()
from (values
  ('默认周二接送', 'Tuesday pickup'),
  ('默认周一、三、四、五接送', 'Mon, Wed, Thu, Fri pickup')
) as names(original, english)
where r.name = names.original
  and (r.operating_term_id is null or r.operating_term_id = current_operating_term());
