import {Suspense} from 'react';
import Link from 'next/link';
import {calendarMonth,workweek} from '@/lib/workweek';
import {todayInOperationsTimeZone,formatDate} from '@/lib/date';
import {requireUser} from '@/lib/auth';
import {getLocale} from '@/lib/i18n-server';
import {text,type Locale} from '@/lib/i18n';
import {driverScheduleDate} from '@/lib/driver-week';
import {readDriverScheduleOverview} from '@/lib/driver-schedule-overview';
import {readTrialRange} from '@/lib/schedule-trial-data';
import {db} from '@/lib/db';
import {getTrips} from '@/lib/data';
import {DriverWeekTabs} from '@/components/driver-week-tabs';
import {scheduleDatePeriod,schedulePeriodLabels} from '@/lib/schedule-day-status';
export const dynamic='force-dynamic';
type Params={week?:string|string[];day?:string;view?:string};
type ActualStop={stopId:string;arrivedAt:string|null;departedAt:string|null;dropOffAt:string|null;finishedAt:string|null};
function actualStopText(stop:ActualStop|undefined,locale:Locale){
 const events=[['到达','Arrived',stop?.arrivedAt],['出发','Departed',stop?.departedAt],['送达','Dropped off',stop?.dropOffAt],['结束','Finished',stop?.finishedAt]];
 const times=events.filter(([, ,value])=>value).map(([zh,en,value])=>`${text(locale,zh!,en!)} ${new Intl.DateTimeFormat('en-GB',{timeZone:'America/Los_Angeles',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(value!))}`);
 return times.length?text(locale,'实际：','Actual: ')+times.join(' · '):null;
}
export default async function DriverWeekPage({searchParams}:{searchParams:Promise<Params>}){
 const user=await requireUser(['DRIVER']);const locale=await getLocale(),params=await searchParams,today=todayInOperationsTimeZone();
 const date=driverScheduleDate(params.week,today),monthly=params.view==='month',month=calendarMonth(date),dates=monthly?month.days:workweek(date).days;
 const selected=dates.includes(params.day??'')?params.day!:dates.includes(today)?today:dates[0];
 const props={today,monthly,month,dates,locale,initialDate:selected};
 return <div className="page-container driver-week-page">
  <Suspense key={monthly+'-'+date+'-'+selected} fallback={<DriverWeekTabs {...props} loading statuses={dates.map(()=>'loading')}>{dates.map(d=><p key={d}>{text(locale,'正在加载日程…','Loading schedule…')}</p>)}</DriverWeekTabs>}>
   <Calendar {...props} driverId={user.driverId??''}/>
  </Suspense>
 </div>;
}
async function Calendar(props:{today:string;monthly:boolean;month:ReturnType<typeof calendarMonth>;dates:string[];locale:Locale;initialDate:string;driverId:string}){
 const overview=await readDriverScheduleOverview(db,props.driverId,props.dates,props.today);
 return <DriverWeekTabs {...props} key={props.initialDate} statuses={props.dates.map(d=>overview.get(d)?'planned':'empty')}>
  {props.dates.map(date=><Suspense key={date} fallback={<p role="status">{text(props.locale,'正在加载当天详情…','Loading day details…')}</p>}>{date===props.initialDate?<Day date={date} today={props.today} locale={props.locale} driverId={props.driverId} monthly={props.monthly}/>:null}</Suspense>)}
 </DriverWeekTabs>;
}
async function Day({date,today,locale,driverId,monthly}:{date:string;today:string;locale:Locale;driverId:string;monthly:boolean}){
 const future=date>today;
 const trips=future?[]:await getTrips(date);
 const trial=future?(await readTrialRange(db,[date],true)).days[0]:undefined;
 const plans=trial?.plans.filter(p=>p.driverId===driverId)??[];
 const completedIds=trips.filter(t=>t.status==='COMPLETED').map(t=>t.id);
 const summaries=completedIds.length?(await db.query<{trip_id:string;actual_stops:ActualStop[]}>(`select trip_id,actual_stops from completed_trip_summaries where trip_id=any($1::uuid[])`,[completedIds])).rows:[];
 const actualStops=new Map(summaries.map(s=>[s.trip_id,new Map(s.actual_stops.map(stop=>[stop.stopId,stop]))]));
 const activeIds=trips.filter(t=>t.status!=='COMPLETED').map(t=>t.id);
 if(activeIds.length){
  const events=(await db.query<{trip_id:string;stopId:string;arrivedAt:string|null;departedAt:string|null;dropOffAt:string|null;finishedAt:string|null}>(`select e.trip_id,e.stop_snapshot->>'id' as "stopId",
   (min(e.occurred_at) filter(where e.event_type='ARRIVED'))::text as "arrivedAt",
   (max(e.occurred_at) filter(where e.event_type='GO' and e.stop_index<jsonb_array_length(t.route_stops)-1))::text as "departedAt",
   (max(e.occurred_at) filter(where e.event_type='DROP_OFF'))::text as "dropOffAt",
   (max(e.occurred_at) filter(where e.event_type='GO' and e.stop_index=jsonb_array_length(t.route_stops)-1))::text as "finishedAt"
   from execution_observations e join trips t on t.id=e.trip_id where e.trip_id=any($1::uuid[])
   group by e.trip_id,e.stop_snapshot->>'id'`,[activeIds])).rows;
  for(const event of events){if(!actualStops.has(event.trip_id))actualStops.set(event.trip_id,new Map());actualStops.get(event.trip_id)!.set(event.stopId,event);}
 }
 const rows=future?plans.map(p=>({id:p.routeId,name:p.name,stops:p.stops,count:p.students.length,status:'PUBLISHED'})):trips.map(t=>({id:t.id,name:t.routeName??'',stops:t.routeStops??[],count:t.riders.length,status:t.status}));
 return <section className={`workweek-day is-${scheduleDatePeriod(date,today)}`}><header className="workweek-day-header"><h2>{formatDate(date,locale)}</h2><span>{schedulePeriodLabels[scheduleDatePeriod(date,today)][locale]} · {rows.length} {text(locale,'个行程',rows.length===1?'ride':'rides')}</span></header>
  {!rows.length&&<p className="workweek-empty">{text(locale,'暂无接送计划','No rides planned')}</p>}
  {rows.map(row=><article className="workweek-trip" key={row.id}>
   <div className="workweek-trip-heading"><h3>{row.name}</h3><span>{row.count} {text(locale,'名学生','students')}</span></div>
   <div className="workweek-completion"><span className={`status-badge status-${row.status.toLowerCase()}`}>{row.status==='COMPLETED'?text(locale,'已完成','Completed'):row.status==='IN_PROGRESS'?text(locale,'进行中','In progress'):row.status==='CANCELED'?text(locale,'已取消','Canceled'):text(locale,'未开始','Not started')}</span></div>
   <div className="workweek-stops">{row.stops.map(s=>{const actual=actualStopText(actualStops.get(row.id)?.get(s.id),locale);return <div className="workweek-stop" key={s.id}><time title={text(locale,'计划时间','Planned time')}>{s.time}</time><strong>{s.name}</strong>{actual&&<small className="workweek-actual">{actual}</small>}</div>})}</div>
  </article>)}
  {trial?.issues.filter(i=>i.routeId&&plans.some(p=>p.routeId===i.routeId)).map((i,index)=><p className="form-error" key={index}>{i.message.split(' / ')[locale==='zh'?0:1]??i.message}</p>)}
  {!future&&<Link className="workweek-detail" href={`/driver?date=${date}&week=${date}&view=${monthly?'month':'week'}`}>{text(locale,'查看当天任务','View day')} →</Link>}
 </section>;
}
