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
import {PageHeader} from '@/components/page-header';
import {scheduleDatePeriod,schedulePeriodLabels} from '@/lib/schedule-day-status';
export const dynamic='force-dynamic';
type Params={week?:string|string[];day?:string;view?:string};
export default async function DriverWeekPage({searchParams}:{searchParams:Promise<Params>}){
 const user=await requireUser(['DRIVER']);const locale=await getLocale(),params=await searchParams,today=todayInOperationsTimeZone();
 const date=driverScheduleDate(params.week,today),monthly=params.view==='month',month=calendarMonth(date),dates=monthly?month.days:workweek(date).days;
 const selected=dates.includes(params.day??'')?params.day!:dates.includes(today)?today:dates[0];
 const props={today,monthly,month,dates,locale,initialDate:selected};
 return <div className="page-container driver-week-page"><PageHeader title={text(locale,'我的日程','My schedule')} description={text(locale,'选择日期，查看当天接送计划。','Choose a date to view your plans.')}/>
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
 const rows=future?plans.map(p=>({id:p.routeId,name:p.name,stops:p.stops,count:p.students.length})):trips.map(t=>({id:t.id,name:t.routeName??'',stops:t.routeStops??[],count:t.riders.length}));
 return <section className={`workweek-day is-${scheduleDatePeriod(date,today)}`}><header className="workweek-day-header"><h2>{formatDate(date,locale)}</h2><span>{schedulePeriodLabels[scheduleDatePeriod(date,today)][locale]} · {rows.length} {text(locale,'个行程','trips')}</span></header>
  {!rows.length&&<p className="workweek-empty">{text(locale,'暂无接送计划','No trips planned')}</p>}
  {rows.map(row=><article className="workweek-trip" key={row.id}>
   <div className="workweek-trip-heading"><h3>{row.name}</h3><span>{row.count} {text(locale,'名学生','students')}</span></div>
   <div className="workweek-stops">{row.stops.map(s=><p className="workweek-stop" key={s.id}><time>{s.time}</time><strong>{s.name}</strong></p>)}</div>
  </article>)}
  {trial?.issues.filter(i=>i.routeId&&plans.some(p=>p.routeId===i.routeId)).map((i,index)=><p className="form-error" key={index}>{i.message.split(' / ')[locale==='zh'?0:1]??i.message}</p>)}
  {!future&&<Link className="workweek-detail" href={`/driver?date=${date}&week=${date}&view=${monthly?'month':'week'}`}>{text(locale,'查看当天任务','View day')} →</Link>}
 </section>;
}
