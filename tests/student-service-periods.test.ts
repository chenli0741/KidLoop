import test from "node:test";
import assert from "node:assert/strict";
import { isStudentInService } from "../src/lib/student-service-periods";

test("student service periods are inclusive and support leaving and rejoining", () => {
  const student = { servicePeriods: [
    { id: "first", startsOn: "2026-09-01", endsOn: "2026-09-30" },
    { id: "second", startsOn: "2026-11-15", endsOn: "2026-12-31" },
  ] };
  assert.equal(isStudentInService(student, "2026-09-01"), true);
  assert.equal(isStudentInService(student, "2026-09-30"), true);
  assert.equal(isStudentInService(student, "2026-10-01"), false);
  assert.equal(isStudentInService(student, "2026-11-14"), false);
  assert.equal(isStudentInService(student, "2026-11-15"), true);
  assert.equal(isStudentInService({ servicePeriods: [] }, "2026-09-15"), false);
  assert.equal(isStudentInService({}, "2026-09-15"), true);
});
