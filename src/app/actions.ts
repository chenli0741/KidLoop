"use server";
import { requireTerm, openTerm, initializeSchools } from "@/lib/operating-terms";
import { attachPhoto, photoPath } from "@/lib/student-photos";

import { requireUser } from "@/lib/auth";
import { changeRiderStatus } from "@/lib/rider-status";
import { readTripExecution } from "@/lib/read-trip-execution";
import type { MissedPickupDetails } from "@/lib/missed-pickup";
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
    revalidatePath("/routes");
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
    await transaction(async client => {
      await client.query("select pg_advisory_xact_lock(70919009)");
      await client.query(`
      insert into schools (name, address, pickup_map_url, pickup_instructions, dismissal_time)
      values ($1, $2, $3, $4, $5::time)
    `, [
      required(formData, "name"),
      required(formData, "address"),
      mapUrl,
      required(formData, "pickupInstructions"),
      optional(formData, "dismissalTime") || null,
    ]);
      const term=await openTerm(client);
      if(term)await initializeSchools(client,term);
    });
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
  const user = await requireUser(["ADMIN"]);
  const photo = optional(formData, "photoUrl");
  if (!photoPath.test(photo)) return {ok:false,message:"请选择并上传学生照片。 / Please upload a student photo."};
  return runMutation(async () => {
    const age = positiveInteger(formData, "age");
    if (age < 3 || age > 20) throw new Error("age must be between 3 and 20");

    await transaction(async (client) => {
      const operation=await requireTerm(client,String(formData.get("operatingTermId")));
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

      const student = await client.query<{id:string}>(`
        insert into students
          (classroom_id, parent_id, program_id, name, photo_url, grade, age, notes)
        values ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8) returning id
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
      await attachPhoto(client,photo,student.rows[0].id,user.id);
      await client.query("insert into term_students(operating_term_id,student_id,reviewed) values($1,$2,true)",[operation.id,student.rows[0].id]);
    });
  }, ["/", "/students", "/schedule"], { zh: "学生已添加。", en: "Student added." });
}

export async function updateRiderStatus(tripStudentId: string, nextStatus: RiderStatus, details?: MissedPickupDetails) {
  const user = await requireUser(["ADMIN", "DRIVER"]);
  return transaction(async (client) => {
    const tripId = await changeRiderStatus(client, user, tripStudentId, nextStatus, details);
    return readTripExecution(client, tripId);
  });
}
