export type DriverUnavailability = {
  id: string;
  driverId: string;
  startsOn: string;
  endsOn: string;
  weekdays: number[];
  unavailableFrom: string | null;
  unavailableTo: string | null;
  reason: string;
};

function weekday(date: string) {
  return new Date(`${date}T12:00:00Z`).getUTCDay() || 7;
}

/** A matching all-day record blocks the driver; a timed record blocks overlapping work. */
export function driverIsAvailable(
  records: DriverUnavailability[] | undefined,
  driverId: string,
  date: string,
  start: string,
  end: string,
) {
  return !driverBlockingUnavailability(records, driverId, date, start, end);
}

export function driverBlockingUnavailability(
  records: DriverUnavailability[] | undefined,
  driverId: string,
  date: string,
  start: string,
  end: string,
) {
  return (records ?? []).find((record) => {
    if (
      record.driverId !== driverId ||
      record.startsOn > date ||
      record.endsOn < date ||
      !record.weekdays.includes(weekday(date))
    ) return false;
    if (!record.unavailableFrom || !record.unavailableTo) return true;
    return start < record.unavailableTo && record.unavailableFrom < end;
  });
}
