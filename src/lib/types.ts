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
};

export type Driver = {
  id: string;
  name: string;
  phone: string;
  status: DriverStatus;
};

export type School = {
  id: string;
  name: string;
  address: string;
  pickupMapUrl: string | null;
  pickupInstructions: string;
  dismissalTime: string;
};

export type Program = {
  id: string;
  name: string;
  address: string;
  dropoffInfo: string;
  requirements: string;
};

export type Classroom = {
  id: string;
  schoolId: string;
  schoolName: string;
  name: string;
};

export type Student = {
  id: string;
  name: string;
  photoUrl: string;
  grade: string;
  age: number;
  classroomName: string;
  classroomId: string;
  schoolId: string;
  schoolName: string;
  programId: string;
  programName: string;
  parentName: string;
  parentPhone: string;
  relationship: string;
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
  id: string;
  studentId: string;
  name: string;
  photoUrl: string;
  classroomName: string;
  grade: string;
  age: number;
  parentName: string;
  parentPhone: string;
  status: RiderStatus;
};

export type Trip = {
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
  dismissalTime: string;
  programName: string;
  programAddress: string;
  dropoffInfo: string;
  programRequirements: string;
  riders: Rider[];
};
