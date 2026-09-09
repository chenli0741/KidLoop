import { Suspense } from 'react';
import { calendarMonth, workweek } from '@/lib/workweek';
import { todayInOperationsTimeZone } from '@/lib/date';
import { requireUser } from '@/lib/auth';
import type { Locale } from '@/lib/i18n';
import Link from 'next/link';
import { BusFront, UsersRound } from 'lucide-react';
import { driverScheduleDate, getDriverWeek } from '@/lib/driver-week';
import { getLocale } from '@/lib/i18n-server';
import { text } from '@/lib/i18n';
import { formatDate, formatTime } from '@/lib/date';
import { tripSegments } from '@/lib/trip-segments';
import { PageHeader } from '@/components/page-header';
import { DriverWeekTabs } from '@/components/driver-week-tabs';
import { scheduleDatePeriod, schedulePeriodLabels } from '@/lib/schedule-day-status';
import { StatusBadge } from '@/components/status-badge';

export const dynamic = 'force-dynamic';

type ScheduleParams = { week?: string | string[]; day?: string; view?: string };

export default async function DriverWeekPage({ searchParams }: { searchParams: Promise<ScheduleParams> }) {
  await requireUser(['DRIVER']);
  const params = await searchParams;
  const locale = await getLocale();
  const monthly = params.view === 'month';
  const today = todayInOperationsTimeZone();
  const date = driverScheduleDate(params.week, today);
  const month = calendarMonth(date);
  const dates = monthly ? month.days : workweek(date).days;
  return <div className="page-container driver-week-page">
    <PageHeader title={text(locale, '我的日程', 'My schedule')}
      description={text(locale, '选择日期，查看当天接送计划。', 'Choose a date to view your plans.')} />
    <Suspense key={`${monthly}-${date}-${params.day}`} fallback={
      <DriverWeekTabs today={today} loading monthly={monthly} month={month} statuses={dates.map(() => 'loading')} dates={dates} locale={locale} initialDate={params.day || today}>
        {dates.map(day => <p key={day} role="status" className="workweek-empty">{text(locale, '正在加载日程…', 'Loading schedule…')}</p>)}
      </DriverWeekTabs>
    }>
      <ScheduleContent params={params} locale={locale} />
    </Suspense>
  </div>;
}

async function ScheduleContent({ params, locale }: { params: ScheduleParams; locale: Locale }) {
  const monthly = params.view === 'month';
  const week = await getDriverWeek(params.week, monthly,params.day);
  return (
    <DriverWeekTabs today={week.today} key={`${monthly}-${week.selectedDate}`} monthly={monthly} month={week.month} statuses={week.days.map(day => day.hasTrips?'planned':'empty')} dates={week.days.map(day => day.date)} locale={locale}
      initialDate={week.selectedDate}>
      {week.days.map(day => <section className={`workweek-day is-${scheduleDatePeriod(day.date,week.today)}`} key={day.date} aria-labelledby={`day-${day.date}`}>
        <header className="workweek-day-header">
          <Link href={`/driver?date=${day.date}&week=${week.days[0].date}&view=${monthly ? 'month' : 'week'}`} id={`day-${day.date}`}>
            <h2>{formatDate(day.date, locale)}</h2>
            <span>{schedulePeriodLabels[scheduleDatePeriod(day.date,week.today)][locale]} · {day.trips.length} {text(locale, '个行程', 'trips')} →</span>
          </Link>
        </header>
        {day.trips.length === 0 ? <p className="workweek-empty">{text(locale, '暂无接送计划', 'No trips planned')}</p> : <div className="workweek-trips">
          {day.trips.map(trip => <article className="workweek-trip" key={trip.id}>
            <div className="workweek-trip-heading"><strong>{formatTime(trip.departureTime, locale)}</strong><StatusBadge status={trip.status} /></div>
            <p className="workweek-vehicle"><BusFront size={15} /><span>{trip.vehicleName} · {trip.vehiclePlate}</span></p>
            {tripSegments(trip).map((segment, index) => {
              const stops = segment.routeStops;
              const paired = stops?.length === 2;
              const absent = segment.riders.filter(r => r.status === 'ABSENT').length;
              return <div className="workweek-segment" key={index}>
                <div><strong>{paired ? stops[0].name : segment.schoolName || segment.routeName}</strong><time>{formatTime(paired ? stops[0].time : segment.departureTime, locale)}</time></div>
                <span className="workweek-arrow" aria-hidden="true">↓</span>
                <div><strong>{paired ? stops[1].name : segment.programName || text(locale, '接送地点待补充', 'Stops pending')}</strong>{paired && <time>{formatTime(stops[1].time, locale)}</time>}</div>
                <p><UsersRound size={14} />{segment.riders.length} {text(locale, '名学生', 'students')}{absent > 0 && text(locale, ` · ${absent} 名缺席`, ` · ${absent} absent`)}</p>
              </div>;
            })}
            <Link className="workweek-detail" href={`/driver?date=${day.date}&week=${week.days[0].date}&view=${monthly ? 'month' : 'week'}`}>{text(locale, '查看当天任务', 'View day')} →</Link>
          </article>)}
        </div>}
      </section>)}
    </DriverWeekTabs>
  );
}
