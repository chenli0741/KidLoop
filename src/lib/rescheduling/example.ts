import type { Intent, Snapshot } from "./types";
import type { FixedRoute } from "../fixed-route-types";
// Synthetic data only; never represents a live school or roster.
export function reschedulingExample() {
  const route = (
    id: string,
    school: string,
    student: string,
    start: string,
    end: string,
  ): FixedRoute => ({
    id,
    name: id,
    routeType: "RECURRING",
    startsOn: "2026-09-01",
    endsOn: "2026-09-30",
    weekdays: [1, 2, 3, 4, 5],
    driverId: "d1",
    vehicleId: "v1",
    enabled: true,
    updatedAt: "",
    stops: [
      {
        id: `${id}a`,
        name: school,
        schoolId: school,
        programId: null,
        address: school,
        time: start,
      },
      {
        id: `${id}b`,
        name: "Program",
        schoolId: null,
        programId: "p",
        address: "p",
        time: end,
      },
    ],
    students: [
      { studentId: student, pickupStopId: `${id}a`, dropoffStopId: `${id}b` },
    ],
  });
  const snapshot: Snapshot = {
    hash: "",
    term: { id: "term", startsOn: "2026-09-01", endsOn: "2026-09-30" },
    routes: [
      route("r1", "s1", "a", "12:00", "12:30"),
      route("r2", "s2", "b", "13:00", "13:30"),
    ],
    students: [
      {
        id: "a",
        name: "A",
        schoolId: "s1",
        grade: "K",
        programId: "p",
        reviewed: true,
      },
      {
        id: "b",
        name: "B",
        schoolId: "s2",
        grade: "K",
        programId: "p",
        reviewed: true,
      },
    ],
    drivers: [
      { id: "d1", name: "D1", active: true, status: "AVAILABLE" },
      { id: "d2", name: "D2", active: true, status: "AVAILABLE" },
    ],
    vehicles: [
      { id: "v1", name: "V1", active: true, status: "AVAILABLE", capacity: 1 },
      { id: "v2", name: "V2", active: true, status: "AVAILABLE", capacity: 1 },
    ],
    travelTimes: [],
    days: [
      {
        date: "2026-09-08",
        matches: [
          { student_id: "a", school_id: "s1", time: "12:00" },
          { student_id: "b", school_id: "s2", time: "13:00" },
        ],
        tasks: [],
        absentIds: [],
      },
    ],
  };
  const intent: Intent = {
    startsOn: "2026-09-08",
    endsOn: "2026-09-08",
    changes: [{ schoolId: "s2", grades: ["K"], time: "12:15" }],
    unavailableDriverIds: [],
    unavailableVehicleIds: [],
    lockedRouteIds: [],
    preferExistingDrivers: true,
    noAdditionalDrivers: false,
    question: "",
  };
  return { snapshot, intent };
}
