import 'server-only';
import {createHash} from 'node:crypto';
import type {PoolClient} from 'pg';
import {readFixedRoutes} from './fixed-routes';
import {readRosterData} from './roster-data';
import {trialDay,type TrialInput,type TrialDay} from './schedule-trial';

export async function readTrialInput(c:Pick<PoolClient,'query'>,start:string,end:string):Promise<TrialInput>{
 const [routes,roster,terms,exceptions,drivers,vehicles,absences,existing]=await Promise.all([
  readFixedRoutes(c),readRosterData(c),
  c.query(`select school_id as "schoolId",starts_on::text as "startsOn",ends_on::text as "endsOn" from school_terms where operating_term_id=current_operating_term() order by id`),
  c.query(`select school_id as "schoolId",starts_on::text as "startsOn",ends_on::text as "endsOn",to_char(pickup_time,'HH24:MI') as "pickupTime",grade_times as "gradeTimes" from school_calendar_exceptions where operating_term_id=current_operating_term() and starts_on<=$2 and ends_on>=$1 order by id`,[start,end]),
  c.query('select id,active,status from drivers order by id'),c.query('select id,active,status,capacity from vehicles order by id'),
  c.query(`select service_date::text as date,student_id as "studentId" from student_day_plans where service_date between $1 and $2 and absent order by service_date,student_id`,[start,end]),
  c.query(`select t.scheduled_date::text as date,t.fixed_route_id as "routeId",t.id as "tripId",sh.driver_id as "driverId",sh.vehicle_id as "vehicleId",to_char(sh.start_time,'HH24:MI') as start,to_char(sh.end_time,'HH24:MI') as end,
   (t.status in ('IN_PROGRESS','COMPLETED','NEEDS_ATTENTION') or exists(select 1 from trip_segment_completions f where f.trip_id=t.id) or exists(select 1 from trip_students x where x.trip_id=t.id and (x.picked_up_at is not null or x.status in ('PICKED_UP','DROPPED_OFF','EXCEPTION') or (x.status='ABSENT' and not x.parent_absence)))) as started,
   coalesce((select array_agg(ts.student_id order by ts.student_id) from trip_students ts where ts.trip_id=t.id),'{}'::uuid[]) as students
   from trips t join driver_shifts sh on sh.id=t.shift_id where t.operating_term_id=current_operating_term() and t.scheduled_date between $1 and $2 and t.status<>'CANCELED' order by t.id`,[start,end])
 ]);
 return {routes,...roster,terms:terms.rows,exceptions:exceptions.rows,drivers:drivers.rows,vehicles:vehicles.rows,absences:absences.rows,existing:existing.rows};
}
export type TrialSummary={date:string;hasTrips:boolean;issueCount:number;holiday:boolean;checked:boolean;driverIds:string[]};
export async function readTrialRange(c:Pick<PoolClient,'query'>,dates:string[],details=false):Promise<{summaries:TrialSummary[];days:TrialDay[]}> {
 if(!dates.length)return {summaries:[],days:[]};
 if(dates.length>62||dates.some(d=>!/^\d{4}-\d{2}-\d{2}$/.test(d)))throw new Error('Invalid preview range');
 const sorted=[...dates].sort(),input=await readTrialInput(c,sorted[0],sorted.at(-1)!);
 const cached=(await c.query<{service_date:string;revision:string;payload:TrialSummary}>(`select service_date::text,revision,payload from schedule_preview_cache where operating_term_id=current_operating_term() and service_date=any($1::date[])`,[dates])).rows;
 const summaries:TrialSummary[]=[],days:TrialDay[]=[],updates:{date:string;revision:string;payload:TrialSummary}[]=[];
 for(const date of dates){
  const weekday=new Date(date+'T12:00:00Z').getUTCDay()||7;
  const routes=input.routes.filter(r=>r.enabled&&r.startsOn<=date&&r.endsOn>=date&&r.weekdays.includes(weekday));
  const dayInput={...input,routes,rules:input.rules.filter(r=>r.weekdays?.includes(weekday)),batches:input.batches.filter(b=>b.weekday===weekday),children:input.children.filter(s=>!s.noPickupWeekdays?.includes(weekday)),drivers:input.drivers.filter(d=>routes.some(r=>r.driverId===d.id)),vehicles:input.vehicles.filter(v=>routes.some(r=>r.vehicleId===v.id)),exceptions:input.exceptions.filter(e=>e.startsOn<=date&&e.endsOn>=date),absences:input.absences.filter(a=>a.date===date),existing:input.existing?.filter(t=>t.date===date)};
  const revision=createHash('sha256').update('school-batches-v1:').update(JSON.stringify(dayInput)).digest('hex');
  const prior=cached.find(r=>r.service_date===date&&r.revision===revision);
  if(prior&&!details){summaries.push(prior.payload);continue;}
  const day=trialDay(dayInput,date);if(details)days.push(day);
  const summary={date,hasTrips:day.plans.length>0||!!dayInput.existing?.length,issueCount:day.issues.length,holiday:day.holiday,checked:day.checked,driverIds:[...new Set([...day.plans.map(p=>p.driverId),...dayInput.existing?.map(t=>t.driverId)??[]])]};
  summaries.push(summary);
  updates.push({date,revision,payload:summary});
 }
 if(updates.length)await c.query(`insert into schedule_preview_cache(operating_term_id,service_date,revision,payload) select current_operating_term(),x.date,x.revision,x.payload from jsonb_to_recordset($1::jsonb) as x(date date,revision text,payload jsonb) where current_operating_term() is not null on conflict(operating_term_id,service_date) do update set revision=excluded.revision,payload=excluded.payload,checked_at=clock_timestamp()`,[JSON.stringify(updates)]);

 return {summaries,days};
}
