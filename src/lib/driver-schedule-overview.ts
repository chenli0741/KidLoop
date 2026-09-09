import 'server-only';
import type {PoolClient} from 'pg';
import {readTrialRange} from './schedule-trial-data';
export async function readDriverScheduleOverview(c:Pick<PoolClient,'query'>,driverId:string,dates:string[],today:string){
 const future=dates.filter(d=>d>=today),past=dates.filter(d=>d<today);
 const result=new Map<string,boolean>(dates.map(d=>[d,false]));
 if(future.length){const {summaries}=await readTrialRange(c,future);for(const s of summaries)result.set(s.date,s.driverIds.includes(driverId));}
 if(past.length){const rows=await c.query<{date:string}>(`select distinct scheduled_date::text as date from trips t join driver_shifts sh on sh.id=t.shift_id where t.operating_term_id=current_operating_term() and sh.driver_id=$1 and t.scheduled_date=any($2::date[]) and t.status not in ('DRAFT','CANCELED')`,[driverId,past]);for(const r of rows.rows)result.set(r.date,true);}
 return result;
}
