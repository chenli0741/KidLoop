/** Calendar arithmetic uses UTC so DST does not shift a weekday. Input is an ISO date. */
export function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function workweek(date: string) {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const monday = shiftDate(date, -(weekday === 0 ? 6 : weekday - 1));
  return {
    monday,
    friday: shiftDate(monday, 4),
    days: Array.from({ length: 5 }, (_, index) => shiftDate(monday, index)),
    previous: shiftDate(monday, -7),
    next: shiftDate(monday, 7),
  };
}

export function calendarMonth(date: string) {
  const first = `${date.slice(0, 7)}-01`;
  const value = new Date(`${first}T12:00:00Z`);
  value.setUTCMonth(value.getUTCMonth() + 1);
  const next = value.toISOString().slice(0, 10);
  value.setUTCMonth(value.getUTCMonth() - 2);
  const previous = value.toISOString().slice(0, 10);
  const count = Number(shiftDate(next, -1).slice(8));
  return { first, next, previous, offset: (new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7,
    days: Array.from({ length: count }, (_, i) => shiftDate(first, i)) };
}
