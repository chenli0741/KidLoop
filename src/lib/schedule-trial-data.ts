import type { SqlReader } from "@/lib/sql-reader";
import { readDriverRuns } from './driver-familiarity-data';
import 'server-only';
import {createHash} from 'node:crypto';
import {readFixedRoutes} from './fixed-routes';
import {readRosterData} from './roster-data';
import {trialDay,type TrialInput,type TrialDay} from './schedule-trial';

export async function readTrialInput(c:SqlReader,start:string,end:string):Promise<TrialInput>{
 const rosterPromise=readRosterData(c);
 const [routes,roster,terms,exceptions,drivers,vehicles,absences,existing,travelTimes,driverRuns,shifts]=await Promise.all([
  readFixedRoutes(c,undefined,rosterPromise),rosterPromise,
  c.query(`select school_id as "schoolId",starts_on::text as "startsOn",ends_on::text as "endsOn" from school_terms where operating_term_id=current_operating_term() order by id`),
  c.query(`select school_id as "schoolId",starts_on::text as "startsOn",ends_on::text as "endsOn",to_char(pickup_time,'HH24:MI') as "pickupTime",grade_times as "gradeTimes" from school_calendar_schedules where operating_term_id=current_operating_term() and starts_on<=$2 and ends_on>=$1 order by id`,[start,end]),
  c.query(`select id,active,status,to_char(earliest_dismissal_time,'HH24:MI') as "earliestDismissalTime",to_char(latest_dismissal_time,'HH24:MI') as "latestDismissalTime",school_preference_mode as "schoolPreferenceMode",array(select school_id from driver_school_preferences dsp where dsp.driver_id=drivers.id order by school_id) as "preferredSchoolIds" from drivers order by id`),c.query('select id,active,status,capacity from vehicles order by id'),
  c.query(`select service_date::text as date,student_id as "studentId" from student_day_plans where service_date between $1 and $2 and absent order by service_date,student_id`,[start,end]),
  c.query(`select t.scheduled_date::text as date,coalesce(t.generated_plan_id,t.fixed_route_id) as "routeId",t.source_route_id as "sourceRouteId",t.route_stops as stops,t.id as "tripId",sh.driver_id as "driverId",sh.vehicle_id as "vehicleId",to_char(sh.start_time,'HH24:MI') as start,to_char(sh.end_time,'HH24:MI') as end,
   (t.status in ('IN_PROGRESS','COMPLETED','NEEDS_ATTENTION') or exists(select 1 from trip_segment_completions f where f.trip_id=t.id) or exists(select 1 from trip_students x where x.trip_id=t.id and (x.picked_up_at is not null or x.status in ('PICKED_UP','DROPPED_OFF','EXCEPTION') or (x.status='ABSENT' and not x.parent_absence)))) as started,
   coalesce((select array_agg(ts.student_id order by ts.student_id) from trip_students ts where ts.trip_id=t.id),'{}'::uuid[]) as students
   from trips t join driver_shifts sh on sh.id=t.shift_id where t.operating_term_id=current_operating_term() and t.scheduled_date between $1 and $2 and t.status<>'CANCELED' order by t.id`,[start,end]),
  c.query(`select from_name as "fromName",to_name as "toName",estimated_minutes + buffer_minutes as minutes,origin_dwell_minutes as "originDwellMinutes" from travel_time_profiles where active`),
  readDriverRuns(c,start,end),
  c.query(`select sh.shift_date::text as date,null as "routeId",sh.id as "tripId",sh.driver_id as "driverId",sh.vehicle_id as "vehicleId",to_char(sh.start_time,'HH24:MI') as start,to_char(sh.end_time,'HH24:MI') as end,true as started,'{}'::uuid[] as students,'[]'::jsonb as stops
   from driver_shifts sh where sh.shift_date between $1 and $2 and sh.status<>'CANCELED' and not exists(select 1 from trips t where t.shift_id=sh.id)`,[start,end])
 ]);
 return {routes,...roster,driverRuns,terms:terms.rows,exceptions:exceptions.rows,drivers:drivers.rows,vehicles:vehicles.rows,absences:absences.rows,travelTimes:travelTimes.rows,existing:[...existing.rows,...shifts.rows]};
}
export type TrialSummary={date:string;hasTrips:boolean;issueCount:number;holiday:boolean;checked:boolean;driverIds:string[]};
export async function readTrialRange(c:SqlReader,dates:string[],details=false,sharedInput?:Promise<TrialInput>):Promise<{summaries:TrialSummary[];days:TrialDay[]}> {
 if(!dates.length)return {summaries:[],days:[]};
 if(dates.length>62||dates.some(d=>!/^\d{4}-\d{2}-\d{2}$/.test(d)))throw new Error('Invalid preview range');
 const sorted=[...dates].sort(),input=await (sharedInput ?? readTrialInput(c,sorted[0],sorted.at(-1)!));
 const cached=(await c.query<{service_date:string;revision:string;payload:TrialSummary}>(`select service_date::text,revision,payload from schedule_preview_cache where operating_term_id=current_operating_term() and service_date=any($1::date[])`,[dates])).rows;
 const summaries:TrialSummary[]=[],days:TrialDay[]=[],updates:{date:string;revision:string;payload:TrialSummary}[]=[];
 for(const date of dates){
  const weekday=new Date(date+'T12:00:00Z').getUTCDay()||7;
  const routes=input.routes.filter(r=>r.enabled&&r.startsOn<=date&&r.endsOn>=date&&r.weekdays.includes(weekday));
  const dayInput={...input,routes,rules:input.rules.filter(r=>r.weekdays?.includes(weekday)),batches:input.batches.filter(b=>b.weekday===weekday),children:input.children.filter(s=>!s.noPickupWeekdays?.includes(weekday)),drivers:input.drivers,vehicles:input.vehicles,exceptions:input.exceptions.filter(e=>e.startsOn<=date&&e.endsOn>=date),absences:input.absences.filter(a=>a.date===date),existing:input.existing?.filter(t=>t.date===date)};
  const revision=createHash('sha256').update('school-batches-extra-v3-transfer-warnings:').update(JSON.stringify(dayInput)).digest('hex');
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
