import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calendarMonth, shiftDate, workweek } from '../src/lib/workweek';

test('workweek includes exactly Monday to Friday for weekdays and weekends', () => {
  for (const day of ['2026-09-07','2026-09-08','2026-09-11','2026-09-12','2026-09-13']) {
    assert.deepEqual(workweek(day).days, ['2026-09-07','2026-09-08','2026-09-09','2026-09-10','2026-09-11']);
  }
});
test('week navigation crosses month/year and DST boundaries without shifting dates', () => {
  const week = workweek('2027-01-01');
  assert.equal(week.monday, '2026-12-28'); assert.equal(week.friday, '2027-01-01');
  assert.equal(workweek(week.previous).next, week.monday);
  assert.equal(workweek(week.next).previous, week.monday);
  assert.equal(workweek('2026-03-08').monday, '2026-03-02');
  assert.equal(workweek('2026-11-01').friday, '2026-10-30');
  assert.equal(shiftDate('2028-02-28', 1), '2028-02-29');
});

test('month calendar aligns weekdays and handles leap years and year boundaries', () => {
  const september = calendarMonth('2026-09-08');
  assert.equal(september.offset, 1);
  assert.equal(september.days.length, 30);
  assert.equal(september.days.at(-1), '2026-09-30');
  assert.equal(calendarMonth('2028-02-10').days.length, 29);
  assert.equal(calendarMonth('2027-02-10').days.length, 28);
  assert.equal(calendarMonth('2026-12-10').next, '2027-01-01');
  assert.equal(calendarMonth('2027-01-10').previous, '2026-12-01');
});
