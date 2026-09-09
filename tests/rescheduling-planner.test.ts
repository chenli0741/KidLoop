import { test } from "node:test";
import assert from "node:assert/strict";
import { calculatePlan, validateIntent } from "../src/lib/rescheduling/planner";
import { reschedulingExample as fixture } from "../src/lib/rescheduling/example";

test("a time change causing a downstream overlap reallocates real resources; original snapshot stays unchanged", () => {
  const { snapshot, intent } = fixture(),
    saved = structuredClone(snapshot);
  const result = calculatePlan(snapshot, intent);
  assert.ok(result.candidates.length);
  const routes = result.candidates[0].days[0].after;
  assert.notEqual(routes[0].driverId, routes[1].driverId);
  assert.notEqual(routes[0].vehicleId, routes[1].vehicleId);
  assert.deepEqual(snapshot, saved);
  assert.equal(
    calculatePlan(snapshot, { ...intent, noAdditionalDrivers: true }).candidates
      .length,
    0,
  );
});
test("a locked route stays unchanged while its conflicting neighbor can move", () => {
  const { snapshot, intent } = fixture();
  const plan = calculatePlan(snapshot, { ...intent, lockedRouteIds: ["r1"] });
  assert.ok(plan.candidates.length);
  assert.equal(plan.candidates[0].days[0].after[0].driverId, "d2");
  assert.equal(plan.candidates[0].days[0].replaceIds.includes("r1"), false);
});
test("invalid dates, duplicated grade times and unknown resources cannot enter the planner", () => {
  const { snapshot, intent } = fixture();
  for (const value of [
    { ...intent, startsOn: "2026-02-30" },
    { ...intent, endsOn: "2026-09-30" },
    { ...intent, changes: [...intent.changes, ...intent.changes] },
    { ...intent, unavailableDriverIds: ["missing"] },
  ])
    assert.throws(() => validateIntent(value, snapshot, "2026-09-08"));
});
test("cross-school merge uses known directed template intervals and preserves capacity", () => {
  const { snapshot, intent } = fixture();
  snapshot.drivers = snapshot.drivers.slice(0, 1);
  snapshot.vehicles = [{ ...snapshot.vehicles[0], capacity: 2 }];
  const guide = structuredClone(snapshot.routes[0]);
  guide.id = "guide";
  guide.enabled = false;
  guide.students = [];
  guide.stops = [
    snapshot.routes[0].stops[0],
    { ...snapshot.routes[1].stops[0], time: "12:15" },
    { ...snapshot.routes[1].stops[1], time: "12:45" },
  ];
  snapshot.routes.push(guide);
  const result = calculatePlan(snapshot, {
    ...intent,
    noAdditionalDrivers: true,
  });
  assert.ok(result.candidates.length);
  const joined = result.candidates[0].days[0].after;
  assert.equal(joined.length, 1);
  assert.equal(joined[0].students.length, 2);
  assert.deepEqual(
    joined[0].stops.map((s) => s.time),
    ["12:00", "12:15", "12:45"],
  );
  snapshot.vehicles[0].capacity = 1;
  assert.equal(calculatePlan(snapshot, intent).candidates.length, 0);
  snapshot.routes.pop();
  snapshot.vehicles[0].capacity = 2;
  assert.equal(
    calculatePlan(snapshot, intent).candidates.length,
    0,
    "no invented edge between schools",
  );
});

test("locked unavailable resources report a conflict instead of silently dropping students", () => {
  const {snapshot, intent} = fixture();
  snapshot.drivers[0].active = false;
  const result = calculatePlan(snapshot, {...intent, lockedRouteIds:["r1"]});
  assert.equal(result.candidates.length, 0);
  assert.match(result.conflicts.join(" "), /锁定线路的人车不可用/);
});

test("a started mixed-grade route rejects dismissal changes even when its latest stop time stays unchanged", () => {
  const { snapshot, intent } = fixture();
  const route = snapshot.routes[0];
  snapshot.students.push({ ...snapshot.students[0], id: "older", grade: "3" });
  route.students.push({ ...route.students[0], studentId: "older" });
  snapshot.days[0].matches.push({ student_id: "older", school_id: "s1", time: "12:00" });
  snapshot.days[0].tasks.push({ routeId: route.id, tripId: "started", driverId: "d1", vehicleId: "v1", start: "12:00", end: "12:30", started: true, students: route.students, stops: route.stops });
  const result = calculatePlan(snapshot, { ...intent, changes: [{ schoolId: "s1", grades: ["K"], time: "11:45" }] });
  assert.equal(result.candidates.length, 0);
  assert.match(result.conflicts.join(" "), /已执行或锁定线路不能改动/);
});
