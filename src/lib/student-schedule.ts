export function noPickupWeekdays(form: FormData): number[] {
  const raw = form.getAll('noPickupWeekdays');
  if (raw.some(value => typeof value !== 'string' || !/^[1-7]$/.test(value))) throw new Error('Invalid weekdays');
  return [...new Set(raw.map(Number))].sort();
}
