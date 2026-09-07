"use server";

import { revalidatePath } from "next/cache";
import { query, transaction } from "@/lib/db";
import type { FormState, RiderStatus } from "@/lib/types";

function required(formData: FormData, key: string) {
  const value = formData.get(key);
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} is required`);
  return value.trim();
}

function optional(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function positiveInteger(formData: FormData, key: string) {
  const value = Number(required(formData, key));
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${key} must be a positive number`);
  return value;
}

function messageFor(error: unknown) {
  if (error instanceof Error) {
    if (error.message.includes("duplicate key")) return "This record already exists.";
    if (error.message.includes("violates foreign key")) return "A related record no longer exists.";
    const expected = [
      "is required", "must be", "already has", "does not have enough seats",
      "must fall within", "no longer available", "already have a trip",
      "Every student", "At least one student",
    ];
    if (expected.some((part) => error.message.includes(part))) return error.message;
  }
  return "Could not save the change. Please review the details and try again.";
}

async function runMutation(work: () => Promise<void>, paths: string[], success: string): Promise<FormState> {
  try {
    await work();
    for (const path of paths) revalidatePath(path);
    return { ok: true, message: success };
  } catch (error) {
    console.error("KidLoop mutation failed", error);
    return { ok: false, message: messageFor(error) };
  }
}

export async function createVehicle(_: FormState, formData: FormData): Promise<FormState> {
  return runMutation(async () => {
    await query(
      "insert into vehicles (name, plate, capacity) values ($1, $2, $3)",
      [required(formData, "name"), required(formData, "plate").toUpperCase(), positiveInteger(formData, "capacity")],
    );
  }, ["/", "/fleet", "/schedule"], "Vehicle added.");
}

export async function createDriver(_: FormState, formData: FormData): Promise<FormState> {
  return runMutation(async () => {
    await query(
      "insert into drivers (name, phone) values ($1, $2)",
      [required(formData, "name"), required(formData, "phone")],
    );
  }, ["/", "/fleet", "/schedule"], "Driver added.");
}

export async function createSchool(_: FormState, formData: FormData): Promise<FormState> {
  return runMutation(async () => {
    await query(`
      insert into schools (name, address, pickup_map_url, pickup_instructions, dismissal_time)
      values ($1, $2, $3, $4, $5::time)
    `, [
      required(formData, "name"),
      required(formData, "address"),
      required(formData, "pickupMapUrl"),
      required(formData, "pickupInstructions"),
      required(formData, "dismissalTime"),
    ]);
  }, ["/students", "/schedule"], "School added.");
}

export async function createProgram(_: FormState, formData: FormData): Promise<FormState> {
  return runMutation(async () => {
    await query(`
      insert into after_school_programs (name, address, dropoff_info, requirements)
      values ($1, $2, $3, $4)
    `, [
      required(formData, "name"),
      required(formData, "address"),
      required(formData, "dropoffInfo"),
      required(formData, "requirements"),
    ]);
  }, ["/students", "/schedule"], "After-school program added.");
}

export async function createClassroom(_: FormState, formData: FormData): Promise<FormState> {
  return runMutation(async () => {
    await query(
      "insert into classrooms (school_id, name) values ($1::uuid, $2)",
      [required(formData, "schoolId"), required(formData, "name")],
    );
  }, ["/students"], "Class added.");
}

export async function createStudent(_: FormState, formData: FormData): Promise<FormState> {
  return runMutation(async () => {
    const age = positiveInteger(formData, "age");
    if (age < 3 || age > 20) throw new Error("age must be between 3 and 20");

    await transaction(async (client) => {
      const parent = await client.query<{ id: string }>(`
        insert into parents (name, relationship, phone, backup_phone, email)
        values ($1, $2, $3, nullif($4, ''), nullif($5, ''))
        returning id
      `, [
        required(formData, "parentName"),
        required(formData, "relationship"),
        required(formData, "parentPhone"),
        optional(formData, "backupPhone"),
        optional(formData, "email"),
      ]);

      await client.query(`
        insert into students
          (classroom_id, parent_id, program_id, name, photo_url, grade, age, notes)
        values ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8)
      `, [
        required(formData, "classroomId"),
        parent.rows[0].id,
        required(formData, "programId"),
        required(formData, "name"),
        required(formData, "photoUrl"),
        required(formData, "grade"),
        age,
        optional(formData, "notes"),
      ]);
    });
  }, ["/", "/students", "/schedule"], "Student added.");
}

export async function createShift(_: FormState, formData: FormData): Promise<FormState> {
  return runMutation(async () => {
    const driverId = required(formData, "driverId");
    const vehicleId = required(formData, "vehicleId");
    const shiftDate = required(formData, "shiftDate");
    const startTime = required(formData, "startTime");
    const endTime = required(formData, "endTime");
    if (startTime >= endTime) throw new Error("endTime must be after startTime");

    const conflict = await query<{ driver_conflict: boolean; vehicle_conflict: boolean }>(`
      select
        bool_or(driver_id = $1::uuid) as driver_conflict,
        bool_or(vehicle_id = $2::uuid) as vehicle_conflict
      from driver_shifts
      where shift_date = $3::date
        and status <> 'CANCELED'
        and start_time < $5::time
        and end_time > $4::time
        and (driver_id = $1::uuid or vehicle_id = $2::uuid)
    `, [driverId, vehicleId, shiftDate, startTime, endTime]);

    if (conflict.rows[0]?.driver_conflict) throw new Error("The driver already has an overlapping shift.");
    if (conflict.rows[0]?.vehicle_conflict) throw new Error("The vehicle already has an overlapping shift.");

    await query(`
      insert into driver_shifts (driver_id, vehicle_id, shift_date, start_time, end_time)
      values ($1::uuid, $2::uuid, $3::date, $4::time, $5::time)
    `, [driverId, vehicleId, shiftDate, startTime, endTime]);
  }, ["/", "/fleet", "/schedule"], "Driver shift scheduled.");
}

export async function createTrip(_: FormState, formData: FormData): Promise<FormState> {
  return runMutation(async () => {
    const shiftId = required(formData, "shiftId");
    const schoolId = required(formData, "schoolId");
    const programId = required(formData, "programId");
    const scheduledDate = required(formData, "scheduledDate");
    const departureTime = required(formData, "departureTime");
    const studentIds = formData.getAll("studentIds").filter((value): value is string => typeof value === "string");
    if (!studentIds.length) throw new Error("At least one student is required");

    await transaction(async (client) => {
      const shift = await client.query<{ capacity: number; shift_date: string; start_time: string; end_time: string }>(`
        select v.capacity, sh.shift_date::text, sh.start_time::text, sh.end_time::text
        from driver_shifts sh
        join vehicles v on v.id = sh.vehicle_id
        where sh.id = $1::uuid and sh.status <> 'CANCELED'
        for update
      `, [shiftId]);
      if (!shift.rowCount) throw new Error("The selected shift is no longer available.");
      const selectedShift = shift.rows[0];
      if (selectedShift.shift_date !== scheduledDate) throw new Error("The trip date must match the shift date.");
      if (departureTime < selectedShift.start_time || departureTime > selectedShift.end_time) {
        throw new Error("The departure time must fall within the selected shift.");
      }
      if (studentIds.length > selectedShift.capacity) throw new Error("The selected vehicle does not have enough seats.");

      const eligible = await client.query<{ id: string }>(`
        select st.id
        from students st
        join classrooms c on c.id = st.classroom_id
        where st.id = any($1::uuid[])
          and c.school_id = $2::uuid
          and st.program_id = $3::uuid
          and st.active = true
      `, [studentIds, schoolId, programId]);
      if (eligible.rowCount !== studentIds.length) {
        throw new Error("Every student must belong to the selected school and after-school program.");
      }

      const duplicate = await client.query(`
        select 1
        from trip_students ts
        join trips t on t.id = ts.trip_id
        where t.scheduled_date = $1::date
          and t.status <> 'CANCELED'
          and ts.student_id = any($2::uuid[])
        limit 1
      `, [scheduledDate, studentIds]);
      if (duplicate.rowCount) throw new Error("One or more students already have a trip on this date.");

      const trip = await client.query<{ id: string }>(`
        insert into trips (shift_id, school_id, program_id, scheduled_date, departure_time)
        values ($1::uuid, $2::uuid, $3::uuid, $4::date, $5::time)
        returning id
      `, [shiftId, schoolId, programId, scheduledDate, departureTime]);

      for (const studentId of studentIds) {
        const rider = await client.query<{ id: string }>(`
          insert into trip_students (trip_id, student_id)
          values ($1::uuid, $2::uuid)
          returning id
        `, [trip.rows[0].id, studentId]);
        await client.query(`
          insert into status_history (trip_student_id, from_status, to_status)
          values ($1::uuid, null, 'SCHEDULED')
        `, [rider.rows[0].id]);
      }
    });
  }, ["/", "/schedule"], "Trip published.");
}

export async function updateRiderStatus(tripStudentId: string, nextStatus: RiderStatus) {
  const allowed: Record<RiderStatus, RiderStatus[]> = {
    SCHEDULED: ["PICKED_UP", "ABSENT", "EXCEPTION"],
    PICKED_UP: ["DROPPED_OFF", "EXCEPTION"],
    DROPPED_OFF: [],
    ABSENT: [],
    EXCEPTION: ["PICKED_UP", "ABSENT"],
  };

  await transaction(async (client) => {
    const current = await client.query<{ status: RiderStatus; trip_id: string }>(`
      select status, trip_id from trip_students where id = $1::uuid for update
    `, [tripStudentId]);
    if (!current.rowCount) throw new Error("Student trip assignment not found.");
    const rider = current.rows[0];
    if (!allowed[rider.status].includes(nextStatus)) throw new Error("This status change is not allowed.");

    await client.query(`
      update trip_students
      set status = $2,
          picked_up_at = case when $2 = 'PICKED_UP' then now() else picked_up_at end,
          dropped_off_at = case when $2 = 'DROPPED_OFF' then now() else dropped_off_at end,
          updated_at = now()
      where id = $1::uuid
    `, [tripStudentId, nextStatus]);
    await client.query(`
      insert into status_history (trip_student_id, from_status, to_status)
      values ($1::uuid, $2, $3)
    `, [tripStudentId, rider.status, nextStatus]);
    await client.query(`
      update trips
      set status = (
        select case
          when bool_or(ts.status = 'EXCEPTION') then 'NEEDS_ATTENTION'
          when bool_and(ts.status in ('DROPPED_OFF', 'ABSENT')) then 'COMPLETED'
          when bool_or(ts.status in ('PICKED_UP', 'DROPPED_OFF')) then 'IN_PROGRESS'
          else 'PUBLISHED'
        end
        from trip_students ts where ts.trip_id = $1::uuid
      ), updated_at = now()
      where id = $1::uuid
    `, [rider.trip_id]);
  });

  revalidatePath("/");
  revalidatePath("/schedule");
}
