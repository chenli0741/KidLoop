// US federal recurring holidays, including weekend observed days (OPM).
// https://www.opm.gov/policy-data-oversight/pay-leave/federal-holidays/
export function federalHolidays(start: string, end: string) {
  const holidays = new Map<string, string>();
  const add = (date: Date, name: string) => {
    const key = date.toISOString().slice(0, 10);
    if (key >= start && key <= end) holidays.set(key, name);
  };
  const nth = (year: number, month: number, weekday: number, n: number) => {
    const d = new Date(Date.UTC(year, month, 1));
    d.setUTCDate(1 + ((weekday - d.getUTCDay() + 7) % 7) + (n - 1) * 7);
    return d;
  };
  for (
    let year = Number(start.slice(0, 4)) - 1;
    year <= Number(end.slice(0, 4)) + 1;
    year++
  ) {
    for (const [month, day, name] of [
      [0, 1, "New Year"],
      [5, 19, "Juneteenth"],
      [6, 4, "Independence Day"],
      [10, 11, "Veterans Day"],
      [11, 25, "Christmas"],
    ] as const) {
      const d = new Date(Date.UTC(year, month, day));
      add(d, name);
      if (d.getUTCDay() === 6) {
        d.setUTCDate(d.getUTCDate() - 1);
        add(d, `${name} (observed)`);
      } else if (d.getUTCDay() === 0) {
        d.setUTCDate(d.getUTCDate() + 1);
        add(d, `${name} (observed)`);
      }
    }
    for (const [month, weekday, n, name] of [
      [0, 1, 3, "MLK Day"],
      [1, 1, 3, "Washington's Birthday"],
      [8, 1, 1, "Labor Day"],
      [9, 1, 2, "Columbus Day"],
      [10, 4, 4, "Thanksgiving"],
    ] as const)
      add(nth(year, month, weekday, n), name);
    const memorial = new Date(Date.UTC(year, 5, 0));
    memorial.setUTCDate(
      memorial.getUTCDate() - ((memorial.getUTCDay() + 6) % 7),
    );
    add(memorial, "Memorial Day");
  }
  return [...holidays]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, name]) => ({ date, name }));
}
