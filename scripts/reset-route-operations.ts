/** One-time, user-authorized reset of execution data; default mode rolls back. */
import {createHash} from 'node:crypto';
import {db} from '../src/lib/db';
import {lockRoutes,materializeRoutes} from '../src/lib/fixed-routes';
import {todayInOperationsTimeZone} from '../src/lib/date';
import {readTrialRange} from '../src/lib/schedule-trial-data';
import {calendarMonth} from '../src/lib/workweek';
async function main(){
 const apply=process.argv.includes('--apply'),date=todayInOperationsTimeZone(),c=await db.connect();
 const core=['students','schools','after_school_programs','parents','drivers','vehicles','app_users','user_students','student_photos','school_terms','school_pickup_rules','school_calendar_schedules','student_day_plans'];
 const fingerprint=async()=>{
  const hash=createHash('sha256');for(const table of core)hash.update(JSON.stringify((await c.query(`select to_jsonb(t) as row from ${table} t order by to_jsonb(t)::text`)).rows));return hash.digest('hex');
 };
 try{
  await c.query('begin');await lockRoutes(c);const before=await fingerprint();
  const counts=(await c.query(`select (select count(*)::int from trips) as trips,(select count(*)::int from trip_students) as assignments,(select count(*)::int from driver_shifts) as shifts,(select count(*)::int from status_history) as status_history`)).rows[0];
  await c.query('delete from reschedule_route_replacements');await c.query('delete from reschedule_usage');await c.query('delete from reschedule_requests');
  await c.query('delete from trips');await c.query('delete from driver_shifts');
  await c.query('delete from route_task_issues');await c.query('delete from schedule_preview_cache');
  // These are obsolete, unused school-route definitions, not the visible fixed routes.
  await c.query('delete from pickup_routes');
  await materializeRoutes(c,date,date);
  const preview=await readTrialRange(c,calendarMonth(date).days.filter(d=>d>=date));
  if(await fingerprint()!==before)throw new Error('Core records changed during execution reset');
  const rebuilt=(await c.query(`select (select count(*)::int from trips) as trips,(select count(*)::int from trip_students) as assignments,(select count(*)::int from status_history) as status_history`)).rows[0];
  if((await c.query(`select ts.student_id from trip_students ts join trips t on t.id=ts.trip_id group by t.scheduled_date,ts.student_id having count(*)>1`)).rowCount)throw new Error('Duplicate daily assignment after reset');
  await c.query(apply?'commit':'rollback');
  console.log(JSON.stringify({mode:apply?'applied':'rolled back',date,cleared:counts,rebuilt,coreRecordsUnchanged:true,previewDays:preview.summaries.length,todayIssues:preview.summaries.find(s=>s.date===date)?.issueCount}));
 }catch(e){await c.query('rollback');throw e;}finally{c.release();await db.end();}
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Reset failed');process.exitCode=1;});
