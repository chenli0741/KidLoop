"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { transaction } from "@/lib/db";
import { changeFleetRecord, FleetEditError, type FleetKind } from "@/lib/fleet-management";
import { getLocale } from "@/lib/i18n-server";
import { text } from "@/lib/i18n";
import type { FormState } from "@/lib/types";

async function mutate(kind: FleetKind, form: FormData, deleting: boolean): Promise<FormState> {
  await requireUser(["ADMIN"]);
  const locale = await getLocale();
  try {
    await transaction((client) => changeFleetRecord(client, kind, form, deleting));
    for (const path of ["/fleet", "/schedule", "/", "/driver", "/parent"]) revalidatePath(path);
    return { ok: true, message: deleting ? text(locale, "已删除，历史记录已保留。", "Removed. History retained.") : text(locale, "资料已保存。", "Details saved.") };
  } catch (error) {
    const messages: Record<string, [string, string]> = {
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
