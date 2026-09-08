export type VehicleStatus = "AVAILABLE" | "IN_SERVICE" | "MAINTENANCE";
export type DriverStatus = "AVAILABLE" | "OFF_DUTY";
export type ShiftStatus = "SCHEDULED" | "ACTIVE" | "COMPLETED" | "CANCELED";
export type TripStatus = "DRAFT" | "PUBLISHED" | "IN_PROGRESS" | "COMPLETED" | "CANCELED" | "NEEDS_ATTENTION";
export type RiderStatus = "SCHEDULED" | "PICKED_UP" | "DROPPED_OFF" | "ABSENT" | "EXCEPTION";

export type FormState = {
  ok: boolean;
  message: string;
};

export type Vehicle = {
  id: string;
  name: string;
  plate: string;
  capacity: number;
  status: VehicleStatus;
  updatedAt: string;
};

export type Driver = {
  id: string;
  name: string;
  phone: string;
  status: DriverStatus;
  updatedAt: string;
};

export type School = {
  id: string;
  /** Preferred everyday display name. */
  name: string;
  fullName: string;
  shortName: string | null;
  updatedAt: string;
  address: string;
  pickupMapUrl: string | null;
  pickupInstructions: string;
  dismissalTime: string | null;
};

export type Program = {
  id: string;
  name: string;
  address: string;
  dropoffInfo: string;
  requirements: string;
};

export type Student = {
  id: string;
  name: string;
  photoUrl: string;
  grade: string;
  age: number | null;
  classroomName: string;
  noPickupWeekdays?: number[];
  routeAssigned?: boolean;
  schoolId: string;
  schoolName: string;
  programId: string;
  programName: string;
  parentName: string;
  parentPhone: string;
  relationship: string;
  backupPhone: string;
  email: string;
  notes: string;
  updatedAt: string;
};

export type Shift = {
  id: string;
  shiftDate: string;
  startTime: string;
  endTime: string;
  status: ShiftStatus;
  driverId: string;
  driverName: string;
  vehicleId: string;
  vehicleName: string;
  vehiclePlate: string;
  capacity: number;
};

export type Rider = {
  pickupStopId?:string|null; dropoffStopId?:string|null; schoolName?:string;
  id: string;
  studentId: string;
  name: string;
  photoUrl: string;
  classroomName: string;
  grade: string;
  age: number | null;
  parentName: string;
  parentPhone: string;
  status: RiderStatus;
  parentNote: string;
  missedPickupNote?: string;
  parentAbsent: boolean;
};

export type Trip = {
  executionVersion?: string;
  completedSegments?: string[];
  routeName?:string|null; routeStops?:import("./fixed-route-types").RouteStop[]|null;
  id: string;
  scheduledDate: string;
  departureTime: string;
  status: TripStatus;
  driverName: string;
  driverPhone: string;
  vehicleName: string;
  vehiclePlate: string;
  capacity: number;
  schoolName: string;
  schoolAddress: string;
  pickupMapUrl: string | null;
  pickupInstructions: string;
  dismissalTime: string | null;
  programName: string;
  programAddress: string;
  dropoffInfo: string;
  programRequirements: string;
  riders: Rider[];
};

export type UserRole = "ADMIN" | "DRIVER" | "PARENT";
export type AuthUser = { id: string; email: string; name: string; role: UserRole; driverId: string | null };
export type DayPlan = { studentId: string; serviceDate: string; absent: boolean; note: string; updatedAt: string };
