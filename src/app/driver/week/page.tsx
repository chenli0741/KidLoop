import Link from 'next/link';
import { BusFront, UsersRound } from 'lucide-react';
import { getDriverWeek } from '@/lib/driver-week';
import { getLocale } from '@/lib/i18n-server';
import { text } from '@/lib/i18n';
import { formatDate, formatTime } from '@/lib/date';
import { tripSegments } from '@/lib/trip-segments';
import { PageHeader } from '@/components/page-header';
import { DriverWeekTabs } from '@/components/driver-week-tabs';
import { StatusBadge } from '@/components/status-badge';

export const dynamic = 'force-dynamic';

export default async function DriverWeekPage({ searchParams }: { searchParams: Promise<{ week?: string | string[]; day?: string; view?: string }> }) {
  const params = await searchParams;
  const monthly = params.view === 'month';
  const [week, locale] = await Promise.all([getDriverWeek(params.week, monthly), getLocale()]);
  return <div className="page-container driver-week-page">
    <PageHeader eyebrow={text(locale, '我的安排', 'My schedule')} title={text(locale, '日程', 'Schedule')}
      description={text(locale, '选择星期，查看当天接送计划。', 'Choose a weekday to view your plans.')} />
    <DriverWeekTabs key={`${monthly}-${week.days[0].date}`} monthly={monthly} month={week.month} hasTrips={week.days.map(day => day.trips.length > 0)} dates={week.days.map(day => day.date)} locale={locale}
      initialDate={params.day || week.today}>
      {week.days.map(day => <section className={`workweek-day${day.date === week.today ? ' is-today' : ''}`} key={day.date} aria-labelledby={`day-${day.date}`}>
        <header className="workweek-day-header">
          <Link href={`/driver?date=${day.date}&week=${week.days[0].date}&view=${monthly ? 'month' : 'week'}`} id={`day-${day.date}`}>
            <h2>{formatDate(day.date, locale)}</h2>
            <span>{day.date === week.today ? text(locale, '今天 · ', 'Today · ') : ''}{day.trips.length} {text(locale, '个行程', 'trips')} →</span>
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
  </div>;
}
