"use server";
import { requireTerm, openTerm, initializeSchools } from "@/lib/operating-terms";
import { attachPhoto, photoPath } from "@/lib/student-photos";

import { requireUser } from "@/lib/auth";
import { changeRiderStatus } from "@/lib/rider-status";
import { readTripExecution } from "@/lib/read-trip-execution";
import type { MissedPickupDetails } from "@/lib/missed-pickup";
import { noPickupWeekdays } from '@/lib/student-schedule';
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { query, transaction } from "@/lib/db";
import { isLocale, LOCALE_COOKIE, text, type Locale } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";
import type { FormState, RiderStatus } from "@/lib/types";
import { assignNewStudentRoute } from "@/lib/student-route-assignment";
import { todayInOperationsTimeZone } from "@/lib/date";
import { schoolNames, updateSchoolNames } from "@/lib/school-management";
import { isTestAccount } from '@/lib/test-account';
import { pickupMapUrl } from "@/lib/map-url";

export async function listStudentStatusReasons() {
  const user = await requireUser(["ADMIN", "DRIVER", "PARENT"]);
  const result = await query<{ id: string; name_zh: string; name_en: string }>(
    "select id,name_zh,name_en from student_status_reasons where active and $1 = any(roles) order by id",
    [user.role],
  );
  return result.rows.map(row => ({ id: row.id, zh: row.name_zh, en: row.name_en }));
}

export async function createTravelTime(_: FormState, formData: FormData): Promise<FormState> {
  return runMutation(async () => {
    const from = required(formData, "fromName");
    const to = required(formData, "toName");
    const minutes = positiveInteger(formData, "estimatedMinutes");
    const buffer = Number(optional(formData, "bufferMinutes") || 0);
    if (from === to || !Number.isInteger(buffer) || buffer < 0 || buffer > 120) throw new Error("Invalid travel time.");
    const dwell = Number(optional(formData, "dwellMinutes") || 0);
    if (!Number.isInteger(dwell) || dwell < 0 || dwell > 120) throw new Error("Invalid dwell time.");
    await query(`insert into travel_time_profiles(from_name,to_name,estimated_minutes,buffer_minutes,origin_dwell_minutes,notes) values($1,$2,$3,$4,$5,$6) on conflict(from_name,to_name) do update set estimated_minutes=excluded.estimated_minutes,buffer_minutes=excluded.buffer_minutes,origin_dwell_minutes=excluded.origin_dwell_minutes,notes=excluded.notes,active=true,updated_at=now()`, [from, to, minutes, buffer, dwell, optional(formData, "notes")]);
  }, ["/resources"], { zh: "地点间时间已保存。", en: "Travel time saved." });
}

export async function deleteTravelTime(_: FormState, formData: FormData): Promise<FormState> {
  return runMutation(async () => { await query("update travel_time_profiles set active=false,updated_at=now() where id=$1", [required(formData, "id")]); }, ["/resources"], { zh: "地点间时间已停用。", en: "Travel time deactivated." });
}

export async function updateTravelTime(_: FormState, formData: FormData): Promise<FormState> {
  return runMutation(async () => {
    const id = required(formData, "id");
    const from = required(formData, "fromName");
    const to = required(formData, "toName");
    const minutes = positiveInteger(formData, "estimatedMinutes");
    const buffer = Number(optional(formData, "bufferMinutes") || 0);
    const dwell = Number(optional(formData, "dwellMinutes") || 0);
    if (from === to || !Number.isInteger(buffer) || buffer < 0 || buffer > 120 || !Number.isInteger(dwell) || dwell < 0 || dwell > 120) throw new Error("Invalid travel time.");
    await query("update travel_time_profiles set from_name=$2,to_name=$3,estimated_minutes=$4,buffer_minutes=$5,origin_dwell_minutes=$6,notes=$7,updated_at=now() where id=$1", [id, from, to, minutes, buffer, dwell, optional(formData, "notes")]);
  }, ["/resources", "/routes"], { zh: "地点时间已更新。", en: "Travel time updated." });
}

export async function updateStudentStatusReason(_: FormState, formData: FormData): Promise<FormState> {
  return runMutation(async () => {
    const id = required(formData, "id");
    const roles = formData.getAll("roles").filter((value): value is string => ["ADMIN", "DRIVER", "PARENT"].includes(String(value))).map(String);
    if (!roles.length) throw new Error("Select at least one role.");
    await query("update student_status_reasons set name_zh=$2,name_en=$3,roles=$4::text[],updated_at=now() where id=$1", [id, required(formData, "nameZh"), required(formData, "nameEn"), roles]);
  }, ["/resources"], { zh: "原因权限已保存。", en: "Reason roles saved." });
}

export async function deleteStudentStatusReason(_: FormState, formData: FormData): Promise<FormState> {
  return runMutation(async () => { await query("update student_status_reasons set active=false,updated_at=now() where id=$1", [required(formData, "id")]); }, ["/resources?tab=reasons"], { zh: "接送原因已删除。", en: "Student status reason deleted." });
}

export async function createStudentStatusReason(_: FormState, formData: FormData): Promise<FormState> {
  return runMutation(async () => {
    const id = required(formData, "id").toUpperCase().replace(/[^A-Z0-9_]/g, "_");
    const nameZh = required(formData, "nameZh");
    const nameEn = required(formData, "nameEn");
    const roles = formData.getAll("roles").filter((value): value is string => ["ADMIN", "DRIVER", "PARENT"].includes(String(value))).map(String);
    if (!/^[A-Z][A-Z0-9_]{1,39}$/.test(id) || !roles.length) throw new Error("Invalid reason.");
    await query("insert into student_status_reasons(id,name_zh,name_en,roles) values($1,$2,$3,$4::text[])", [id, nameZh, nameEn, roles]);
  }, ["/resources?tab=reasons"], { zh: "接送原因已添加。", en: "Student status reason added." });
}

function selectedIds(formData: FormData, key: string) {
  return formData.getAll(key).filter((value): value is string => typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value));
}

export async function createRouteCombinationGroup(_: FormState, formData: FormData): Promise<FormState> {
  return runMutation(async () => {
    const name = required(formData, "name");
    const schools = selectedIds(formData, "schoolIds");
    const programs = selectedIds(formData, "programIds");
    const vehicles = selectedIds(formData, "vehicleIds");
    if (!schools.length && !programs.length) throw new Error("Select at least one stop.");
    await transaction(async client => {
      const result = await client.query<{id:string}>("insert into route_combination_groups(name) values($1) returning id", [name]);
      const id = result.rows[0].id;
      for (const schoolId of schools) await client.query("insert into route_combination_group_stops(group_id,school_id) values($1,$2)", [id, schoolId]);
      for (const programId of programs) await client.query("insert into route_combination_group_stops(group_id,program_id) values($1,$2)", [id, programId]);
      for (const vehicleId of vehicles) await client.query("insert into route_combination_group_vehicles(group_id,vehicle_id) values($1,$2)", [id, vehicleId]);
    });
  }, ["/resources?tab=combinations"], { zh: "组合组已添加。", en: "Combination group added." });
}

export async function updateRouteCombinationGroup(_: FormState, formData: FormData): Promise<FormState> {
  return runMutation(async () => {
    const id = required(formData, "id");
    const name = required(formData, "name");
    const schools = selectedIds(formData, "schoolIds");
    const programs = selectedIds(formData, "programIds");
    const vehicles = selectedIds(formData, "vehicleIds");
    if (!schools.length && !programs.length) throw new Error("Select at least one stop.");
    await transaction(async client => {
      await client.query("update route_combination_groups set name=$2,updated_at=clock_timestamp() where id=$1", [id, name]);
      await client.query("delete from route_combination_group_stops where group_id=$1", [id]);
      await client.query("delete from route_combination_group_vehicles where group_id=$1", [id]);
      for (const schoolId of schools) await client.query("insert into route_combination_group_stops(group_id,school_id) values($1,$2)", [id, schoolId]);
      for (const programId of programs) await client.query("insert into route_combination_group_stops(group_id,program_id) values($1,$2)", [id, programId]);
      for (const vehicleId of vehicles) await client.query("insert into route_combination_group_vehicles(group_id,vehicle_id) values($1,$2)", [id, vehicleId]);
    });
  }, ["/resources?tab=combinations"], { zh: "组合组已保存。", en: "Combination group saved." });
}

export async function deleteRouteCombinationGroup(_: FormState, formData: FormData): Promise<FormState> {
  return runMutation(async () => { await query("delete from route_combination_groups where id=$1", [required(formData, "id")]); }, ["/resources?tab=combinations"], { zh: "组合组已删除。", en: "Combination group deleted." });
}

export async function setLocale(formData: FormData) {
  const user = await requireUser();
  if (isTestAccount(user)) return;
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
    const names = schoolNames(formData);
    const rawMapUrl = optional(formData, "pickupMapUrl");
    const mapUrl = pickupMapUrl(rawMapUrl);
    if (rawMapUrl && !mapUrl) throw new Error("Pickup map must be an HTTPS URL without credentials");
    await transaction(async client => {
      await client.query("select pg_advisory_xact_lock(70919009)");
      await client.query(`
      insert into schools (name, address, pickup_map_url, pickup_instructions, dismissal_time, short_name)
      values ($1, $2, $3, $4, $5::time, $6)
    `, [
      names.name,
      required(formData, "address"),
      mapUrl,
      required(formData, "pickupInstructions"),
      optional(formData, "dismissalTime") || null,
      names.shortName,
    ]);
      const term=await openTerm(client);
      if(term)await initializeSchools(client,term);
    });
  }, ["/resources", "/students", "/schedule"], { zh: "学校已添加。", en: "School added." });
}

export async function updateSchool(_: FormState, formData: FormData): Promise<FormState> {
  return runMutation(() => transaction(client => updateSchoolNames(client, formData)),
    ["/resources", "/students", "/schedule", "/terms", "/admin/accounts", "/parent", "/parent/children", "/driver", "/"],
    { zh: "学校名称已更新。", en: "School names updated." });
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

export async function createStudent(_: FormState, formData: FormData): Promise<FormState> {
  const success = { zh: "学生已添加。", en: "Student added." };
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
          (school_id, parent_id, program_id, name, photo_url, grade, age, notes, classroom_name, no_pickup_weekdays)
        values ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9, $10) returning id
      `, [
        required(formData, "schoolId"),
        parent.rows[0].id,
        required(formData, "programId"),
        required(formData, "name"),
        required(formData, "photoUrl"),
        required(formData, "grade"),
        age,
        optional(formData, "notes"),
        optional(formData, "classroomName").slice(0,100),
        noPickupWeekdays(formData),
      ]);
      await attachPhoto(client,photo,student.rows[0].id,user.id);
      await client.query("insert into term_students(operating_term_id,student_id,reviewed) values($1,$2,true)",[operation.id,student.rows[0].id]);
      const assignment = await assignNewStudentRoute(client, student.rows[0].id, optional(formData, "routeAssignment"), todayInOperationsTimeZone());
      success.zh = assignment.zh;
      success.en = assignment.en;
    });
  }, ["/", "/students", "/schedule", "/driver", "/parent"], success);
}

export async function updateRiderStatus(tripStudentId: string, nextStatus: RiderStatus, details?: MissedPickupDetails, targetTripId?: string, location?: unknown) {
  const user = await requireUser(["ADMIN", "DRIVER"]);
  return transaction(async (client) => {
    const tripId = await changeRiderStatus(client, user, tripStudentId, nextStatus, details, targetTripId, location);
    return readTripExecution(client, tripId);
  });
}
