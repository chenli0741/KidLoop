-- Retain archived terms and execution history; clean only the working term.
update school_pickup_rules
set grades = array(
  select g from unnest(grades) with ordinality as items(g,position)
  where g = any(array['TK','K','1','2','3','4','5','6','7']::text[])
  order by position
), updated_at = clock_timestamp()
where operating_term_id = current_operating_term()
  and not grades <@ array['TK','K','1','2','3','4','5','6','7']::text[];
