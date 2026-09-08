import type { FixedRoute, RouteStop, RouteStudent } from "../fixed-route-types";
import type { PickupMatch } from "../route-plan";
export type Intent = {
  startsOn: string;
  endsOn: string;
  changes: { schoolId: string; grades: string[]; time: string }[];
  unavailableDriverIds: string[];
  unavailableVehicleIds: string[];
  lockedRouteIds: string[];
  preferExistingDrivers: boolean;
  noAdditionalDrivers: boolean;
  question: string;
};
export type Rider = {
  id: string;
  name: string;
  schoolId: string;
  grade: string;
  programId: string | null;
  reviewed: boolean;
};
export type Resource = {
  id: string;
  name: string;
  active: boolean;
  status: string;
  capacity?: number;
};
export type Task = {
  routeId: string | null;
  tripId: string;
  driverId: string;
  vehicleId: string;
  start: string;
  end: string;
  started: boolean;
  students: RouteStudent[];
  stops: RouteStop[];
};
export type Snapshot = {
  term: { id: string; startsOn: string; endsOn: string };
  routes: FixedRoute[];
  students: Rider[];
  drivers: Resource[];
  vehicles: Resource[];
  days: {
    date: string;
    matches: PickupMatch[];
    tasks: Task[];
    absentIds: string[];
  }[];
  hash: string;
};
export type PlannedRoute = {
  sourceIds: string[];
  name: string;
  driverId: string;
  vehicleId: string;
  students: RouteStudent[];
  stops: RouteStop[];
};
export type DayCandidate = {
  date: string;
  before: PlannedRoute[];
  after: PlannedRoute[];
  replaceIds: string[];
};
export type Candidate = {
  days: DayCandidate[];
  changedRoutes: number;
  changedStudents: number;
  additionalDrivers: number;
};
export type PlanResult = {
  candidates: Candidate[];
  conflicts: string[];
  warnings: string[];
  examined: number;
};
export type DraftView = {
  id: string;
  revision: number;
  status: string;
  error: string | null;
  messages: string[];
  intent: Intent | null;
  result: PlanResult | null;
  appliedCandidate: number | null;
  usage: {
    kind: string;
    model: string;
    usage: Record<string, unknown> | null;
    elapsed_ms: number;
    status: string;
    estimated_usd: string | null;
  }[];
};
