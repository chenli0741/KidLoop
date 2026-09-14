import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEarliestDismissalTime } from "../src/lib/driver-conditions";
import { trialDay, type TrialInput } from "../src/lib/schedule-trial";
import { calculatePlan } from "../src/lib/rescheduling/planner";
import { reschedulingExample } from "../src/lib/rescheduling/example";

function fixture(): TrialInput {
  return {
    routes: [{ id: "route", name: "Route", routeType: "RECURRING", startsOn: "2026-09-01", endsOn: "2026-12-18", weekdays: [1], driverId: "yang", vehicleId: "van", enabled: true, updatedAt: "", students: [], stops: [
      { id: "school-stop", schoolId: "school", programId: null, name: "School", address: "", time: "14:00", pickupTime: "14:00" },
      { id: "program-stop", schoolId: null, programId: "program", name: "Program", address: "", time: "14:30" },
    ] }],
    children: [{ id: "child", schoolId: "school", programId: "program", grade: "K", reviewed: true }],
    rules: [{ schoolId: "school", grades: ["K"], weekdays: [1], pickupTime: "14:00" }],
    batches: [], terms: [{ schoolId: "school", startsOn: "2026-09-01", endsOn: "2026-12-18" }], exceptions: [],
    drivers: [{ id: "yang", active: true, status: "AVAILABLE", earliestDismissalTime: "13:00" }],
    vehicles: [{ id: "van", active: true, status: "AVAILABLE", capacity: 10 }], absences: [],
    travelTimes: [{ fromName: "School", toName: "Program", minutes: 30 }],
  };
}
const date = "2026-09-14";
function exception(data: TrialInput, time: string) {
  data.exceptions = [{ schoolId: "school", startsOn: date, endsOn: date, pickupTime: time, gradeTimes: [] }];
}
test("driver time input accepts a blank restriction and rejects malformed values", () => {
  assert.equal(parseEarliestDismissalTime(""), null);
  assert.equal(parseEarliestDismissalTime(null), null);
  assert.equal(parseEarliestDismissalTime("13:00"), "13:00");
  for (const value of ["25:00", "13:60", "1pm", "13:00:00"]) assert.throws(() => parseEarliestDismissalTime(value));
});
test("normal dismissal and exactly 13:00 are allowed", () => {
  const data = fixture();
  assert.equal(trialDay(data, date).plans.length, 1);
  exception(data, "13:00");
  assert.deepEqual(trialDay(data, date).issues, []);
  assert.equal(trialDay(data, date).plans.length, 1);
});
test("early dismissal blocks the restricted driver and leaves children unassigned", () => {
  const data = fixture(); exception(data, "12:59");
  const day = trialDay(data, date);
  assert.equal(day.plans.length, 0);
  assert.ok(day.issues.some(i => i.code === "DRIVER_TIME" && i.routeId === "route"));
  assert.ok(day.issues.some(i => i.code === "UNASSIGNED" && i.studentId === "child"));
  data.drivers[0].earliestDismissalTime = null;
  assert.equal(trialDay(data, date).plans.length, 1);
});
test("grade-specific early dismissal cannot be hidden by later planned arrival", () => {
  const data = fixture(); exception(data, "14:00");
  data.exceptions[0].gradeTimes = [{ grades: ["K"], time: "12:30" }];
  data.routes[0].stops[0].time = "15:00";
  assert.equal(trialDay(data, date).plans.length, 0);
});
test("an ineligible route does not block a valid route assigned to the same driver", () => {
  const data = fixture(); exception(data, "12:30");
  data.children.push({ id: "later", schoolId: "school", programId: "program", grade: "1", reviewed: true });
  data.rules.push({ schoolId: "school", grades: ["1"], weekdays: [1], pickupTime: "15:00" });
  data.exceptions[0].gradeTimes = [{ grades: ["1"], time: "15:00" }];
  const second = structuredClone(data.routes[0]); second.id = "later-route";
  second.stops[0].time = "15:00"; second.stops[0].pickupTime = "15:00"; second.stops[1].time = "15:30";
  data.routes.push(second);
  const day = trialDay(data, date);
  assert.deepEqual(day.plans.map(p => p.routeId), ["later-route"]);
  assert.ok(!day.issues.some(i => i.code === "CONFLICT"));
});
test("rescheduling cannot allocate early dismissals to restricted drivers", () => {
  const { snapshot, intent } = reschedulingExample();
  assert.ok(calculatePlan(snapshot, intent).candidates.length);
  snapshot.drivers.forEach(d => { d.earliestDismissalTime = "13:00"; });
  assert.equal(calculatePlan(snapshot, intent).candidates.length, 0);
  snapshot.drivers.forEach(d => { d.earliestDismissalTime = null; });
  assert.ok(calculatePlan(snapshot, intent).candidates.length);
});
