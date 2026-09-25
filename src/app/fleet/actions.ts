"use server";

import { lockRoutes, materializeRoutes } from "@/lib/fixed-routes";
import { todayInOperationsTimeZone } from "@/lib/date";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { transaction } from "@/lib/db";
import { changeFleetRecord, FleetEditError, type FleetKind } from "@/lib/fleet-management";
import { getLocale } from "@/lib/i18n-server";
import { text } from "@/lib/i18n";
import type { FormState } from "@/lib/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function revalidateFleetSchedule() {
  for (const path of ["/resources", "/routes", "/schedule", "/schedule/dispatch", "/", "/driver", "/parent"]) revalidatePath(path);
}

async function rematerializeAffectedDates(client: Parameters<Parameters<typeof transaction>[0]>[0], startsOn: string, endsOn: string, weekdays: number[]) {
  const today = todayInOperationsTimeZone();
  const dates = await client.query<{ date: string }>(`select distinct scheduled_date::text as date from trips
    where operating_term_id=current_operating_term() and scheduled_date between greatest($1::date,$3::date) and $2::date
      and extract(isodow from scheduled_date)::integer=any($4::integer[]) order by 1`, [startsOn, endsOn, today, weekdays]);
  for (const { date } of dates.rows) await materializeRoutes(client, date, today);
}

async function mutate(kind: FleetKind, form: FormData, deleting: boolean): Promise<FormState> {
  await requireUser(["ADMIN"], true);
  const locale = await getLocale();
  try {
    await transaction(async (client) => {
      // Use the same lock order as schedule generation.
      await lockRoutes(client);
      await changeFleetRecord(client, kind, form, deleting);
      if (kind === "driver" && !deleting) {
        const today = todayInOperationsTimeZone();
        // A newly preferred backup may not own a trip yet; recheck all generated future dates.
        const dates = await client.query<{ date: string }>(`select distinct t.scheduled_date::text as date from trips t
          where t.operating_term_id=current_operating_term() and t.scheduled_date >= $1::date`, [today]);
        for (const { date } of dates.rows) await materializeRoutes(client, date, today);
      }
    });
    revalidateFleetSchedule();
    return { ok: true, message: deleting ? text(locale, "已删除，历史记录已保留。", "Removed. History retained.") : text(locale, "资料已保存。", "Details saved.") };
  } catch (error) {
    const messages: Record<string, [string, string]> = {
      driverPreferences: ["请检查时间范围、学校偏好和所选学校。", "Check the time range, school preference and selected schools."],
      driverTime: ["请填写有效的最早可接放学时间。", "Enter a valid earliest dismissal time."],
      invalid: ["请检查必填信息和状态。", "Check the required fields and status."],
      missing: ["记录已被删除，请刷新页面。", "This record was removed. Refresh the page."],
      stale: ["资料已发生变化，请刷新后重新编辑。", "Details have changed. Refresh before editing again."],
      assigned: ["还有未完成行程或有效排班，请先完成或取消，再删除或停用。", "Complete or cancel open trips and active schedules before removing or making unavailable."],
      capacity: ["请填写车牌号，座位数须为 1 到 100 的整数。", "Enter a plate and an integer seat capacity from 1 to 100."],
      seats: ["座位数不能少于已有未完成行程的学生人数。", "Capacity cannot be lower than the riders on existing open trips."],
      duplicate: ["该车牌号已存在。", "That license plate already exists."],
    };
    const code = error instanceof FleetEditError ? error.message : (error as { code?: string })?.code === "23505" ? "duplicate" : "";
    if (!code) console.error("Fleet mutation failed", error);
    const message = messages[code];
    return { ok: false, message: message ? text(locale, ...message) : text(locale, "保存失败，请重试。", "Could not save. Please try again.") };
  }
}

export async function updateVehicle(form: FormData) { return mutate("vehicle", form, false); }
export async function deleteVehicle(form: FormData) { return mutate("vehicle", form, true); }
export async function updateDriver(form: FormData) { return mutate("driver", form, false); }
export async function deleteDriver(form: FormData) { return mutate("driver", form, true); }

export async function createDriverUnavailability(_state: FormState, form: FormData): Promise<FormState> {
  await requireUser(["ADMIN"], true);
  const locale = await getLocale();
  const driverId = String(form.get("driverId") ?? "");
  const startsOn = String(form.get("startsOn") ?? "");
  const endsOn = String(form.get("endsOn") ?? "");
  const unavailableFrom = String(form.get("unavailableFrom") ?? "").trim();
  const unavailableTo = String(form.get("unavailableTo") ?? "").trim();
  const reason = String(form.get("reason") ?? "").trim();
  const weekdays = form.getAll("weekdays").map(Number).filter((value) => Number.isInteger(value) && value >= 1 && value <= 7);
  const uniqueWeekdays = [...new Set(weekdays)].sort((a, b) => a - b);
  const validDates = DATE.test(startsOn) && DATE.test(endsOn) && startsOn <= endsOn && Date.parse(`${endsOn}T12:00:00Z`) - Date.parse(`${startsOn}T12:00:00Z`) <= 550 * 86400000;
  const validTimes = (!unavailableFrom && !unavailableTo) || (TIME.test(unavailableFrom) && TIME.test(unavailableTo) && unavailableFrom < unavailableTo);
  if (!UUID.test(driverId) || !validDates || !validTimes || !uniqueWeekdays.length || reason.length < 1 || reason.length > 200) {
    return { ok: false, message: text(locale, "请检查司机、日期、星期、时段和原因。日期范围最多 550 天；全天不可用时两个时间都留空。", "Check the driver, dates, weekdays, time window and reason. The range may be up to 550 days; leave both times blank for all-day unavailability.") };
  }
  try {
    await transaction(async (client) => {
      await lockRoutes(client);
      const driver = await client.query("select 1 from drivers where id=$1 and active", [driverId]);
      if (!driver.rowCount) throw new Error("driverMissing");
      await client.query(`insert into driver_unavailability(driver_id,starts_on,ends_on,weekdays,unavailable_from,unavailable_to,reason)
        values($1,$2,$3,$4,$5,$6,$7)`, [driverId, startsOn, endsOn, uniqueWeekdays, unavailableFrom || null, unavailableTo || null, reason]);
      await rematerializeAffectedDates(client, startsOn, endsOn, uniqueWeekdays);
    });
    revalidateFleetSchedule();
    return { ok: true, message: text(locale, "司机不可用时间已保存，受影响的未执行排班已重新计算。", "Driver unavailability saved. Affected unstarted schedules were recalculated.") };
  } catch (error) {
    console.error("Driver unavailability creation failed", error);
    return { ok: false, message: text(locale, "保存失败，请重试。", "Could not save. Please try again.") };
  }
}

export async function updateDriverUnavailability(form: FormData): Promise<FormState> {
  await requireUser(["ADMIN"], true);
  const locale = await getLocale();
  const id = String(form.get("id") ?? "");
  const updatedAt = String(form.get("updatedAt") ?? "");
  const driverId = String(form.get("driverId") ?? "");
  const startsOn = String(form.get("startsOn") ?? "");
  const endsOn = String(form.get("endsOn") ?? "");
  const unavailableFrom = String(form.get("unavailableFrom") ?? "").trim();
  const unavailableTo = String(form.get("unavailableTo") ?? "").trim();
  const reason = String(form.get("reason") ?? "").trim();
  const weekdays = [...new Set(form.getAll("weekdays").map(Number).filter((value) => Number.isInteger(value) && value >= 1 && value <= 7))].sort((a, b) => a - b);
  const validDates = DATE.test(startsOn) && DATE.test(endsOn) && startsOn <= endsOn && Date.parse(`${endsOn}T12:00:00Z`) - Date.parse(`${startsOn}T12:00:00Z`) <= 550 * 86400000;
  const validTimes = (!unavailableFrom && !unavailableTo) || (TIME.test(unavailableFrom) && TIME.test(unavailableTo) && unavailableFrom < unavailableTo);
  if (!UUID.test(id) || !UUID.test(driverId) || !validDates || !validTimes || !weekdays.length || reason.length < 1 || reason.length > 200 || !updatedAt) {
    return { ok: false, message: text(locale, "请检查司机、日期、星期、时段和原因。", "Check the driver, dates, weekdays, time window and reason.") };
  }
  try {
    const changed = await transaction(async (client) => {
      await lockRoutes(client);
      const prior = await client.query<{ startsOn: string; endsOn: string; weekdays: number[] }>(`select starts_on::text as "startsOn",ends_on::text as "endsOn",weekdays from driver_unavailability where id=$1 for update`, [id]);
      if (!prior.rowCount) return "missing";
      const driver = await client.query("select 1 from drivers where id=$1 and active", [driverId]);
      if (!driver.rowCount) return "driverMissing";
      const result = await client.query(`update driver_unavailability set driver_id=$2,starts_on=$3,ends_on=$4,weekdays=$5,unavailable_from=$6,unavailable_to=$7,reason=$8,updated_at=now()
        where id=$1 and updated_at=$9::timestamptz`, [id, driverId, startsOn, endsOn, weekdays, unavailableFrom || null, unavailableTo || null, reason, updatedAt]);
      if (!result.rowCount) return "stale";
      const before = prior.rows[0];
      await rematerializeAffectedDates(client, before.startsOn < startsOn ? before.startsOn : startsOn, before.endsOn > endsOn ? before.endsOn : endsOn, [...new Set([...before.weekdays, ...weekdays])]);
      return "updated";
    });
    if (changed === "missing") return { ok: false, message: text(locale, "记录已被删除，请刷新页面。", "This record was removed. Refresh the page.") };
    if (changed === "driverMissing") return { ok: false, message: text(locale, "所选司机已不可用，请刷新页面。", "The selected driver is no longer available. Refresh the page.") };
    if (changed === "stale") return { ok: false, message: text(locale, "设置已发生变化，请刷新后再修改。", "This setting changed. Refresh before editing again.") };
    revalidateFleetSchedule();
    return { ok: true, message: text(locale, "不可用设置已更新，受影响的未执行排班已重新计算。", "Unavailability updated. Affected unstarted schedules were recalculated.") };
  } catch (error) {
    console.error("Driver unavailability update failed", error);
    return { ok: false, message: text(locale, "保存失败，请重试。", "Could not save. Please try again.") };
  }
}

async function removeDriverUnavailability(form: FormData): Promise<FormState> {
  await requireUser(["ADMIN"], true);
  const locale = await getLocale();
  const id = String(form.get("id") ?? "");
  if (!UUID.test(id)) return { ok: false, message: text(locale, "记录无效，请刷新页面。", "Invalid record. Refresh the page.") };
  try {
    const removed = await transaction(async (client) => {
      await lockRoutes(client);
      const record = await client.query<{ startsOn: string; endsOn: string; weekdays: number[] }>(`delete from driver_unavailability where id=$1
        returning starts_on::text as "startsOn",ends_on::text as "endsOn",weekdays`, [id]);
      if (!record.rowCount) return false;
      const value = record.rows[0];
      await rematerializeAffectedDates(client, value.startsOn, value.endsOn, value.weekdays);
      return true;
    });
    if (!removed) return { ok: false, message: text(locale, "记录已被删除，请刷新页面。", "This record was already removed. Refresh the page.") };
    revalidateFleetSchedule();
    return { ok: true, message: text(locale, "不可用设置已删除，受影响的未执行排班已重新计算。", "Unavailability removed. Affected unstarted schedules were recalculated.") };
  } catch (error) {
    console.error("Driver unavailability deletion failed", error);
    return { ok: false, message: text(locale, "删除失败，请重试。", "Could not remove. Please try again.") };
  }
}

export async function deleteDriverUnavailability(_state: FormState, form: FormData) { return removeDriverUnavailability(form); }
export async function removeDriverUnavailabilityAction(form: FormData) { return removeDriverUnavailability(form); }
