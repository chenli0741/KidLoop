'use client';

import Link, { useLinkStatus } from 'next/link';
import { CalendarDays, Columns3, ChevronLeft, ChevronRight, LoaderCircle } from 'lucide-react';
import { Children, useState, useTransition, type ReactNode } from 'react';
import {useRouter} from 'next/navigation';
import { text, type Locale } from '@/lib/i18n';
import {scheduleStatusLabels,type ScheduleDayStatus} from '@/lib/schedule-day-status';

function NavigationIcon({ children }: { children: ReactNode }) {
  const { pending } = useLinkStatus();
  return <span className="schedule-navigation-icon" aria-busy={pending}>{pending ? <LoaderCircle size={21} className="schedule-spinner" /> : children}</span>;
}

export function DriverWeekTabs({ dates, initialDate, locale, children, monthly, month, statuses, loading = false }: {
  loading?: boolean; monthly: boolean; month: { first: string; previous: string; next: string; offset: number }; statuses: ScheduleDayStatus[];
  dates: string[]; initialDate: string; locale: Locale; children: ReactNode;
}) {
  const [selected, setSelected] = useState(Math.max(0, dates.indexOf(initialDate)));
  const router=useRouter();
  const [pending,startTransition]=useTransition();
  function selectDate(index:number){
    setSelected(index);
    startTransition(()=>router.replace(`/driver/week?view=${monthly?'month':'week'}&week=${dates[index]}&day=${dates[index]}`,{scroll:false}));
  }
  const labels = locale === 'zh' ? ['一', '二', '三', '四', '五'] : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const selectedDate = dates[selected];
  return <>
    <div className="schedule-controls">
      <div className="schedule-view-switch" aria-label={text(locale, '日程视图', 'Schedule view')}>
        <Link prefetch={false} href={`/driver/week?week=${selectedDate}&day=${selectedDate}`} aria-current={!monthly ? 'page' : undefined} aria-label={text(locale, '周视图', 'Week view')} title={text(locale, '周视图', 'Week view')}><NavigationIcon><Columns3 size={21} /></NavigationIcon></Link>
        <Link prefetch={false} href={`/driver/week?view=month&week=${selectedDate}&day=${selectedDate}`} aria-current={monthly ? 'page' : undefined} aria-label={text(locale, '月视图', 'Month view')} title={text(locale, '月视图', 'Month view')}><NavigationIcon><CalendarDays size={21} /></NavigationIcon></Link>
      </div>
      {monthly && <div className="schedule-month-switch">
        <Link prefetch={false} href={`/driver/week?view=month&week=${month.previous}`} aria-label={text(locale, '上个月', 'Previous month')}><NavigationIcon><ChevronLeft size={20} /></NavigationIcon></Link>
        <strong>{month.first.slice(0, 7).replace('-', ' / ')}</strong>
        <Link prefetch={false} href={`/driver/week?view=month&week=${month.next}`} aria-label={text(locale, '下个月', 'Next month')}><NavigationIcon><ChevronRight size={20} /></NavigationIcon></Link>
      </div>}
    </div>
    {monthly && <div className="calendar-weekdays" aria-hidden="true">{['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((label, index) => <span key={index}>{label}</span>)}</div>}

    <div className={monthly ? 'weekday-tabs calendar-month-grid' : 'weekday-tabs'} role="tablist" aria-busy={loading} aria-label={text(locale, '选择日期', 'Choose a date')}>
      {dates.map((date, index) => <button key={date} type="button" role="tab"
        style={monthly && index === 0 ? { gridColumnStart: month.offset + 1 } : undefined}
        data-status={loading?'loading':statuses[index]} title={scheduleStatusLabels[loading?'loading':statuses[index]][locale]}
        aria-label={`${date} ${scheduleStatusLabels[loading?'loading':statuses[index]][locale]}`} id={`weekday-tab-${date}`} aria-controls={`weekday-panel-${date}`}
        aria-selected={selected === index} tabIndex={selected === index ? 0 : -1}
        onClick={() => selectDate(index)} onKeyDown={event => {
          const next = event.key === 'ArrowRight' ? (index + 1) % dates.length
            : event.key === 'ArrowLeft' ? (index + dates.length - 1) % dates.length
              : event.key === 'Home' ? 0 : event.key === 'End' ? dates.length - 1 : null;
          if (next === null) return;
          event.preventDefault();
          selectDate(next);
          document.getElementById(`weekday-tab-${dates[next]}`)?.focus();
        }}>
        {monthly ? <><strong>{Number(date.slice(8))}</strong><span className={`calendar-dot${loading ? ' is-loading' : statuses[index]!=='empty' ? ' has-trips' : ''}`} aria-hidden="true" /></> : <><strong>{labels[index]}</strong><span>{Number(date.slice(5, 7))}/{Number(date.slice(8))}</span></>}
      </button>)}
    </div>
    <div className="schedule-status-legend">{(['planned','empty'] as const).map(status=><span key={status}><i data-status={status} aria-hidden="true"/>{scheduleStatusLabels[status][locale]}</span>)}</div>
    {Children.toArray(children).map((child, index) => <div key={dates[index]} role="tabpanel"
      id={`weekday-panel-${dates[index]}`} aria-labelledby={`weekday-tab-${dates[index]}`}
      hidden={selected !== index} tabIndex={0}>{pending?<p role="status" className="workweek-empty">{text(locale,'正在加载日程…','Loading schedule…')}</p>:child}</div>)}
  </>;
}
