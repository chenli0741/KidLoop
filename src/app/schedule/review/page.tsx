import {Fragment, Suspense} from 'react';
import Link from 'next/link';
import {requireUser} from '@/lib/auth';
import {db} from '@/lib/db';
import {getLocale} from '@/lib/i18n-server';
import {text,type Locale} from '@/lib/i18n';
import {todayInOperationsTimeZone} from '@/lib/date';
import {calendarMonth,workweek} from '@/lib/workweek';
import {readTrialRange} from '@/lib/schedule-trial-data';
import {scheduleDatePeriod} from '@/lib/schedule-day-status';
import {PageHeader} from '@/components/page-header';
import {openTerm} from '@/lib/operating-terms';
import {TermWorkspace} from '@/components/term-workspace';
import {ReviewDatePicker} from '@/components/review-date-picker';
export const dynamic='force-dynamic';
export default async function ReviewPage({searchParams}:{searchParams:Promise<{date?:string;view?:string}>}){
 await requireUser(['ADMIN']);const locale=await getLocale();const term=await openTerm(db);
 if(!term)return <TermWorkspace locale={locale}/>;
 const params=await searchParams,today=todayInOperationsTimeZone();
 const date=params.date&&/^\d{4}-\d{2}-\d{2}$/.test(params.date)&&!Number.isNaN(Date.parse(params.date))?params.date:today;
 const view=params.view==='week'?'week':'month',period=view==='week'?workweek(date):calendarMonth(date);
 return <div className="page-container"><PageHeader title={text(locale,'每日接送核对','Daily pickup review')} description={text(locale,'接送方按学校核对安排，提前发现遗漏和冲突。','Review school pickups for omissions and conflicts ahead of time.')}/>
  <div className="review-controls"><ReviewDatePicker date={date} view={view} label={text(locale,'日期','Date')} /><div className="calendar-view-switch" role="group" aria-label={text(locale,'日历视图','Calendar view')}><Link href={`?date=${date}&view=week`} aria-current={view==='week'?'page':undefined}>{text(locale,'周','Week')}</Link><Link href={`?date=${date}&view=month`} aria-current={view==='month'?'page':undefined}>{text(locale,'月','Month')}</Link></div></div>
  <nav className="review-controls"><Link prefetch={false} href={`?date=${period.previous}&view=${view}`}>{text(locale,'上一页','Previous')}</Link><strong>{date.slice(0,7)}</strong><Link prefetch={false} href={`?date=${period.next}&view=${view}`}>{text(locale,'下一页','Next')}</Link><Link href={`?date=${today}&view=${view}`}>{text(locale,'今天','Today')}</Link></nav>
  <Suspense key={view+date+'summary'} fallback={<p role="status">{text(locale,'正在检查这些日期…','Checking these dates…')}</p>}><Calendar dates={period.days} selected={date} today={today} view={view} locale={locale}/></Suspense>
  <Suspense key={date} fallback={<p role="status">{text(locale,'正在加载当天详情…','Loading day details…')}</p>}><Details date={date} today={today} locale={locale}/></Suspense>
 </div>;
}
async function Calendar({dates,selected,today,view,locale}:{dates:string[];selected:string;today:string;view:string;locale:Locale}){
 const {summaries}=await readTrialRange(db,dates.filter(d=>d>=today));
 if(view==='week') return <><div className="calendar-weekdays review-weekdays" aria-hidden="true">{(locale==='zh'?['一','二','三','四','五']:['M','T','W','T','F']).map((label,index)=><span key={index}>{label}</span>)}</div><div className="review-calendar review-week-calendar">{dates.map(date=>{
  const summary=summaries.find(s=>s.date===date);
  const label=date<today?text(locale,'过去','Past'):!summary||!summary.checked?text(locale,'待核对','Review'):summary.issueCount?text(locale,`异常 ${summary.issueCount}`,`${summary.issueCount} issues`):summary.holiday?text(locale,'无接送','No pickups'):summary.hasTrips?text(locale,'有行程','Trips'):text(locale,'无行程','No trips');
   return <Link prefetch={false} key={date} href={`?date=${date}&view=${view}`} className={`review-date is-${scheduleDatePeriod(date,today)} ${date===selected?'is-selected':''}`} aria-label={`${date} ${label}`} aria-current={date===selected?'date':undefined}><strong>{date===today?text(locale,'今天','Today'):Number(date.slice(8))}</strong><span className={summary?.issueCount?'review-issue-label':''}>{label}</span></Link>;
 })}</div></>;
 const offset=(new Date(`${dates[0]?.slice(0,7)}-01T12:00:00Z`).getUTCDay()+6)%7;
 const slots=[...Array.from({length:offset},()=>null),...dates];
 const weeks=Array.from({length:Math.ceil(slots.length/7)},(_,index)=>slots.slice(index*7,index*7+7));
 const cell=(date:string)=>{const summary=summaries.find(s=>s.date===date);const label=date<today?text(locale,'过去','Past'):!summary||!summary.checked?text(locale,'待核对','Review'):summary.issueCount?text(locale,`异常 ${summary.issueCount}`,`${summary.issueCount} issues`):summary.holiday?text(locale,'无接送','No pickups'):summary.hasTrips?text(locale,'有行程','Trips'):text(locale,'无行程','No trips');return <Link prefetch={false} key={date} href={`?date=${date}&view=${view}`} className={`review-date is-${scheduleDatePeriod(date,today)} ${date===selected?'is-selected':''}`} aria-label={`${date} ${label}`} aria-current={date===selected?'date':undefined}><strong>{date===today?text(locale,'今天','Today'):Number(date.slice(8))}</strong><span className={summary?.issueCount?'review-issue-label':''}>{label}</span></Link>};
 return <><div className="calendar-weekdays review-month-weekdays" aria-hidden="true">{(locale==='zh'?['一','二','三','四','五']:['Mon','Tue','Wed','Thu','Fri']).map(label=><span key={label}>{label}</span>)}<span>{text(locale,'周末','Weekend')}</span></div><div className="review-calendar review-month-calendar">{weeks.map((week,index)=><Fragment key={`week-${index}`}>{week.slice(0,5).map((date,dayIndex)=>date===null?<div key={`blank-${index}-${dayIndex}`} aria-hidden="true"/>:cell(date))}<div className="review-weekend" aria-label={text(locale,'周六周日休息','Saturday and Sunday are off')}>{text(locale,'周末休息','Weekend off')}</div></Fragment>)}</div></>;

}
async function Details({date,today,locale}:{date:string;today:string;locale:Locale}){
 if(date<today)return <section className="pickup-section"><h2>{date}</h2><p>{text(locale,'过去日期仅保留实际执行记录，不按新规则重新试算。','Past dates retain actual execution records and are not recalculated.')}</p></section>;
 const {days}=await readTrialRange(db,[date],true);const day=days[0];
 const [students,schools]=await Promise.all([db.query('select id,name from students'),db.query('select id,coalesce(short_name,name) as name from schools')]);
 return <section className="pickup-section"><h2>{date} · {text(locale,'安排核对','Arrangement review')}</h2><p>{text(locale,`${day.expected} 名应接学生 · ${day.plans.length} 条线路`,`${day.expected} expected students · ${day.plans.length} routes`)}</p>
  {!day.issues.length&&<p>{text(locale,'未发现安排异常。','No arrangement issues found.')}</p>}
  {day.issues.map((issue,index)=><p className="form-error" key={index}>{schools.rows.find(s=>s.id===issue.schoolId)?.name} {students.rows.find(s=>s.id===issue.studentId)?.name} {day.plans.find(p=>p.routeId===issue.routeId)?.name} · {issue.message.split(' / ')[locale==='zh'?0:1]??issue.message}</p>)}
  {day.plans.map(plan=><article className="pickup-record" key={plan.routeId}><h3>{plan.name}</h3><p>{plan.stops.map(s=>`${s.time} ${s.name}`).join(' → ')}</p><p>{plan.students.map(a=>students.rows.find(s=>s.id===a.studentId)?.name).join('、')}</p></article>)}
 </section>;
}
