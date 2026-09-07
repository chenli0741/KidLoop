"use server";

import { requireUser } from "@/lib/auth";
import { recomputeTrip } from "@/lib/day-plans";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { query, transaction } from "@/lib/db";
import { isLocale, LOCALE_COOKIE, text, type Locale } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";
import type { FormState, RiderStatus } from "@/lib/types";
import { pickupMapUrl } from "@/lib/map-url";

export async function setLocale(formData: FormData) {
  const locale = formData.get("locale");
  if (typeof locale !== "string" || !isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

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

function messageFor(error: unknown, locale: Locale) {
  if (error instanceof Error) {
    if (error.message.includes("duplicate key")) return text(locale, "该记录已存在。", "This record already exists.");
    if (error.message.includes("violates foreign key")) return text(locale, "关联记录已不存在。", "A related record no longer exists.");
    const expected = [
      "is required", "must be", "already has", "does not have enough seats",
      "must fall within", "no longer available", "already have a trip",
      "Every student", "At least one student",
    ];
    if (expected.some((part) => error.message.includes(part))) {
      if (locale === "en") return error.message;
      const messages: Array<[string, string]> = [
        ["is required", "请填写所有必填信息。"],
        ["positive number", "请输入有效的正整数。"],
        ["between 3 and 20", "年龄必须在 3 到 20 岁之间。"],
        ["after startTime", "结束时间必须晚于开始时间。"],
        ["driver already", "该司机在此时段已有排班。"],
        ["vehicle already", "该车辆在此时段已有排班。"],
        ["no longer available", "所选排班已不可用。"],
        ["date must match", "行程日期必须与排班日期一致。"],
        ["fall within", "出发时间必须在所选排班时段内。"],
        ["enough seats", "所选车辆座位数不足。"],
        ["Every student", "所有学生必须属于所选学校和课外班，且当天未请假。"],
        ["already have a trip", "一名或多名学生当天已有行程。"],
        ["At least one student", "请至少选择一名学生。"],
      ];
      return messages.find(([part]) => error.message.includes(part))?.[1] ?? "提交的信息无效。";
    }
  }
  return text(locale, "无法保存更改，请检查信息后重试。", "Could not save the change. Please review the details and try again.");
}

async function runMutation(work: () => Promise<void>, paths: string[], success: { zh: string; en: string }): Promise<FormState> {
  await requireUser(["ADMIN"]);
  const locale = await getLocale();
  try {
    await work();
    for (const path of paths) revalidatePath(path);
    revalidatePath("/schedule/dispatch");
    return { ok: true, message: success[locale] };
  } catch (error) {
    console.error("KidLoop mutation failed", error);
    return { ok: false, message: messageFor(error, locale) };
  }
}

export async function createVehicle(_: FormState, formData: FormData): Promise<FormState> {
  return runMutation(async () => {
    await query(
      "insert into vehicles (name, plate, capacity) values ($1, $2, $3)",
      [required(formData, "name"), required(formData, "plate").toUpperCase(), positiveInteger(formData, "capacity")],
    );
  }, ["/", "/resources", "/schedule"], { zh: "车辆已添加。", en: "Vehicle added." });
}

export async function createDriver(_: FormState, formData: FormData): Promise<FormState> {
  return runMutation(async () => {
    await query(
      "insert into drivers (name, phone) values ($1, $2)",
      [required(formData, "name"), required(formData, "phone")],
    );
  }, ["/", "/resources", "/schedule"], { zh: "司机已添加。", en: "Driver added." });
}

export async function createSchool(_: FormState, formData: FormData): Promise<FormState> {
  return runMutation(async () => {
    const rawMapUrl = optional(formData, "pickupMapUrl");
    const mapUrl = pickupMapUrl(rawMapUrl);
    if (rawMapUrl && !mapUrl) throw new Error("Pickup map must be an HTTPS URL without credentials");
    await query(`
      insert into schools (name, address, pickup_map_url, pickup_instructions, dismissal_time)
      values ($1, $2, $3, $4, $5::time)
    `, [
      required(formData, "name"),
      required(formData, "address"),
      mapUrl,
      required(formData, "pickupInstructions"),
      optional(formData, "dismissalTime") || null,
    ]);
  }, ["/resources", "/students", "/schedule"], { zh: "学校已添加。", en: "School added." });
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
  }, ["/resources", "/students", "/schedule"], { zh: "课外班已添加。", en: "After-school program added." });
}

export async function createClassroom(_: FormState, formData: FormData): Promise<FormState> {
  return runMutation(async () => {
    await query(
      "insert into classrooms (school_id, name) values ($1::uuid, $2)",
      [required(formData, "schoolId"), required(formData, "name")],
    );
  }, ["/students", "/schedule"], { zh: "班级已添加。", en: "Class added." });
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
  }, ["/", "/students", "/schedule"], { zh: "学生已添加。", en: "Student added." });
}

export async function createShift(_: FormState, formData: FormData): Promise<FormState> {
  return runMutation(async () => {
    const driverId = required(formData, "driverId");
    const vehicleId = required(formData, "vehicleId");
    const shiftDate = required(formData, "shiftDate");
    const startTime = required(formData, "startTime");
    const endTime = required(formData, "endTime");
    if (startTime >= endTime) throw new Error("endTime must be after startTime");

    await transaction(async (client) => {
      const resources = await client.query(`select v.id from vehicles v cross join drivers d
        where v.id=$1 and d.id=$2 and v.active and d.active
          and v.status='AVAILABLE' and d.status='AVAILABLE' for update of v,d`, [vehicleId, driverId]);
      if (!resources.rowCount) throw new Error("The selected vehicle or driver is no longer available.");
      const conflict = await client.query<{ driver_conflict: boolean; vehicle_conflict: boolean }>(`
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

      await client.query(`
        insert into driver_shifts (driver_id, vehicle_id, shift_date, start_time, end_time)
        values ($1::uuid, $2::uuid, $3::date, $4::time, $5::time)
      `, [driverId, vehicleId, shiftDate, startTime, endTime]);
    });
  }, ["/", "/resources", "/schedule"], { zh: "司机排班已创建。", en: "Driver shift scheduled." });
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
      await client.query("select id from students where id = any($1::uuid[]) order by id for update", [studentIds]);
      const shift = await client.query<{ capacity: number; shift_date: string; start_time: string; end_time: string }>(`
        select v.capacity, sh.shift_date::text, sh.start_time::text, sh.end_time::text
        from driver_shifts sh
        join vehicles v on v.id = sh.vehicle_id
        join drivers d on d.id = sh.driver_id
        where sh.id = $1::uuid and sh.status <> 'CANCELED'
          and v.active and d.active and v.status <> 'MAINTENANCE' and d.status <> 'OFF_DUTY'
        for update of sh,v,d
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
          and not exists (select 1 from student_day_plans dp where dp.student_id = st.id and dp.service_date = $4::date and dp.absent)
      `, [studentIds, schoolId, programId, scheduledDate]);
      if (eligible.rowCount !== studentIds.length) {
        throw new Error("Every student must belong to the selected school and after-school program and must not be absent that day.");
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
  }, ["/", "/schedule"], { zh: "行程已发布。", en: "Trip published." });
}

export async function updateRiderStatus(tripStudentId: string, nextStatus: RiderStatus) {
  const user = await requireUser(["ADMIN", "DRIVER"]);
  const allowed: Record<RiderStatus, RiderStatus[]> = {
    SCHEDULED: ["PICKED_UP", "ABSENT", "EXCEPTION"],
    PICKED_UP: ["DROPPED_OFF", "EXCEPTION"],
    DROPPED_OFF: [], ABSENT: [], EXCEPTION: ["PICKED_UP", "ABSENT"],
  };
  await transaction(async (client) => {
    const target = await client.query<{ student_id: string; trip_id: string }>(`
      select ts.student_id, ts.trip_id from trip_students ts
      join trips t on t.id = ts.trip_id join driver_shifts sh on sh.id = t.shift_id
      where ts.id = $1::uuid and ($2::uuid is null or sh.driver_id = $2)
    `, [tripStudentId, user.role === "DRIVER" ? user.driverId : null]);
    if (!target.rowCount) throw new Error("Assignment unavailable.");
    // Same lock order as parent plans: student, trip, assignment.
    await client.query("select id from students where id = $1 for update", [target.rows[0].student_id]);
    const trip = await client.query<{ status: string }>("select status from trips where id = $1 for update", [target.rows[0].trip_id]);
    if (["DRAFT", "CANCELED", "COMPLETED"].includes(trip.rows[0].status)) throw new Error("Trip is not active.");
    const current = await client.query<{ status: RiderStatus; parent_absence: boolean }>(
      "select status, parent_absence from trip_students where id = $1 for update", [tripStudentId],
    );
    const rider = current.rows[0];
    if (rider.parent_absence || !allowed[rider.status].includes(nextStatus)) throw new Error("This status change is not allowed.");
    await client.query(`
      update trip_students set status = $2,
        picked_up_at = case when $2 = 'PICKED_UP' then now() else picked_up_at end,
        dropped_off_at = case when $2 = 'DROPPED_OFF' then now() else dropped_off_at end,
        updated_at = now() where id = $1
    `, [tripStudentId, nextStatus]);
    await client.query("insert into status_history (trip_student_id, from_status, to_status, actor_id) values ($1, $2, $3, $4)", [tripStudentId, rider.status, nextStatus, user.id]);
    await recomputeTrip(client, target.rows[0].trip_id);
  });
  for (const path of ["/", "/schedule/dispatch", "/driver", "/parent"]) revalidatePath(path);
}
