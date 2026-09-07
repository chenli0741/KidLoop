"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { transaction } from "@/lib/db";
import { saveDayPlan } from "@/lib/day-plans";
import { getLocale } from "@/lib/i18n-server";
import { text } from "@/lib/i18n";
import type { FormState } from "@/lib/types";

export async function updateDayPlan(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser(["PARENT"]);
  const locale = await getLocale();
  try {
    const attendance = form.get("attendance");
    if (attendance !== "attending" && attendance !== "absent") throw new Error("INVALID_INPUT");
    await transaction((client) => saveDayPlan(client, user, {
      studentId: String(form.get("studentId") ?? ""), date: String(form.get("date") ?? ""),
      absent: attendance === "absent", note: String(form.get("note") ?? "").trim(),
    }));
    for (const path of ["/parent", "/driver", "/", "/schedule"]) revalidatePath(path);
    return { ok: true, message: text(locale, "已保存，管理员和相关司机可查看。", "Saved. The administrator and assigned driver can view your update.") };
  } catch (error) {
    const pickedUp = error instanceof Error && error.message === "ALREADY_PICKED_UP";
    return { ok: false, message: pickedUp
      ? text(locale, "孩子已上车，不能改为缺席，请联系司机或管理员。", "Your child has already been picked up. Contact the driver or administrator to make changes.")
      : text(locale, "无法保存。请选择今天或之后的有效日期，留言不超过 1000 字，且只能修改已绑定的孩子。", "Could not save. Choose today or a future valid date, limit the note to 1,000 characters, and select a child linked to your account.") };
  }
}
