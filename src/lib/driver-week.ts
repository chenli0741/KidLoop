import 'server-only';
import { requireUser } from './auth';
import { getTrips } from './data';
import { validServiceDate } from './day-plans';
import { todayInOperationsTimeZone } from './date';
import { calendarMonth, workweek } from './workweek';

export async function getDriverWeek(requested?: string | string[], monthly = false) {
  await requireUser(['DRIVER']);
  const today = todayInOperationsTimeZone();
  const date = typeof requested === 'string' && validServiceDate(requested)
    && requested >= '2021-01-08' && requested <= '2099-12-24' ? requested : today;
  const week = workweek(date);
  // Date reads materialize plans under a shared lock. Run sequentially to avoid lock contention.
  const month = calendarMonth(date);
  const days = [];
  for (const day of monthly ? month.days : week.days) days.push({ date: day, trips: await getTrips(day) });
  return { ...week, month, today, days };
}
