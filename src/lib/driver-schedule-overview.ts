import 'server-only';
import type {PoolClient} from 'pg';

// Read-only calendar projection. Execution is materialized only for the selected day.
export async function readDriverScheduleOverview(c:Pick<PoolClient,'query'>,driverId:string,dates:string[],today:string) {
 const result=await c.query<{date:string;has_trips:boolean}>(`
 with days as (select d::date as date,extract(isodow from d::date)::integer as weekday from unnest($2::text[]) d),
 eligible as (
  select distinct d.date,r.id as route_id,r.driver_id,r.route_type,a.student_id
  from days d join fixed_routes r on d.date between r.starts_on and r.ends_on
   and r.operating_term_id=current_operating_term() and r.enabled and d.weekday=any(r.weekdays)
  join drivers dr on dr.id=r.driver_id and dr.active and dr.status='AVAILABLE'
  join vehicles v on v.id=r.vehicle_id and v.active and v.status<>'MAINTENANCE'
  join fixed_route_students a on a.route_id=r.id
  join students s on s.id=a.student_id and s.active and not(d.weekday=any(s.no_pickup_weekdays))
  join school_terms st on st.school_id=s.school_id and st.operating_term_id=r.operating_term_id and d.date between st.starts_on and st.ends_on
  join school_pickup_rules rule on rule.school_id=s.school_id and rule.operating_term_id=r.operating_term_id and trim(s.grade)=any(rule.grades) and d.weekday=any(rule.weekdays)
  left join school_calendar_exceptions e on e.school_id=s.school_id and e.operating_term_id=r.operating_term_id and d.date between e.starts_on and e.ends_on
  where (r.driver_id=$1 or r.route_type='TEMPORARY') and d.date >= $3::date and (e.id is null or e.pickup_time is not null or jsonb_array_length(e.grade_times)>0)
 )
 select d.date::text,(
  exists(select 1 from trips t join driver_shifts sh on sh.id=t.shift_id where t.operating_term_id=current_operating_term() and t.scheduled_date=d.date and sh.driver_id=$1 and t.status not in ('DRAFT','CANCELED'))
  or exists(select 1 from eligible a where a.date=d.date and a.driver_id=$1
   and not exists(select 1 from trips t where t.fixed_route_id=a.route_id and t.scheduled_date=d.date)
   and (a.route_type='TEMPORARY' or not exists(select 1 from eligible tmp where tmp.date=a.date and tmp.student_id=a.student_id and tmp.route_type='TEMPORARY')))
 ) as has_trips from days d order by d.date`,[driverId,dates,today]);
 return new Map(result.rows.map(r=>[r.date,r.has_trips]));
}
