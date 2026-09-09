import 'server-only';
import { requireUser } from './auth';
import { getTrips } from './data';
import { validServiceDate } from './day-plans';
import { todayInOperationsTimeZone } from './date';
import { calendarMonth, workweek } from './workweek';
import {db} from './db';
import {readDriverScheduleOverview} from './driver-schedule-overview';

export function driverScheduleDate(requested: string | string[] | undefined, today: string) {
  return typeof requested === 'string' && validServiceDate(requested)
    && requested >= '2021-01-08' && requested <= '2099-12-24' ? requested : today;
}

export async function getDriverWeek(requested?: string | string[], monthly = false,requestedDay?:string) {
  const user=await requireUser(['DRIVER']);
  const today = todayInOperationsTimeZone();
  const date = driverScheduleDate(requested, today);
  const week = workweek(date);
  const month = calendarMonth(date);
  const dates=monthly?month.days:week.days;
  const selectedDate=dates.includes(requestedDay??'')?requestedDay!:dates.includes(today)?today:dates[0];
  // Calendar projection is independent of selected-day materialization; only that
  // day's authoritative result overrides the overview below.
  const [trips,overview]=await Promise.all([
    getTrips(selectedDate),
    user.driverId?readDriverScheduleOverview(db,user.driverId,dates,today):Promise.resolve(new Map<string,boolean>()),
  ]);
  const days=dates.map(day=>({date:day,trips:day===selectedDate?trips:[],hasTrips:day===selectedDate?trips.length>0:overview.get(day)??false}));
  return { ...week, month, today, days,selectedDate };
}
