import { test } from "node:test";
import assert from "node:assert/strict";
import { driverIsAvailable, type DriverUnavailability } from "../src/lib/driver-availability";

const base: DriverUnavailability = {
  id: "leave",
  driverId: "driver",
  startsOn: "2026-09-21",
  endsOn: "2026-09-25",
  weekdays: [1, 3, 5],
  unavailableFrom: null,
  unavailableTo: null,
  reason: "Sick leave",
};

test("all-day driver unavailability follows date range and configured weekdays", () => {
  assert.equal(driverIsAvailable([base], "driver", "2026-09-21", "12:00", "13:00"), false);
  assert.equal(driverIsAvailable([base], "driver", "2026-09-22", "12:00", "13:00"), true);
  assert.equal(driverIsAvailable([base], "other", "2026-09-21", "12:00", "13:00"), true);
  assert.equal(driverIsAvailable([base], "driver", "2026-09-28", "12:00", "13:00"), true);
});

test("partial unavailability only blocks overlapping work", () => {
  const timed = { ...base, weekdays: [1, 2, 3, 4, 5], unavailableFrom: "13:00", unavailableTo: "14:00" };
  assert.equal(driverIsAvailable([timed], "driver", "2026-09-21", "12:30", "13:00"), true);
  assert.equal(driverIsAvailable([timed], "driver", "2026-09-21", "13:00", "13:30"), false);
  assert.equal(driverIsAvailable([timed], "driver", "2026-09-21", "13:45", "14:15"), false);
  assert.equal(driverIsAvailable([timed], "driver", "2026-09-21", "14:00", "15:00"), true);
});

