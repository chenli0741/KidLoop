"use server";
import { requireTerm, TermError } from "@/lib/operating-terms";
import { todayInOperationsTimeZone } from "@/lib/date";
import { saveFixedRoute, materializeRoutes } from "@/lib/fixed-routes";
import { requireUser } from "@/lib/auth";
import { transaction } from "@/lib/db";
import { PickupError, savePickupSetting } from "@/lib/pickup-settings";
import { revalidatePath } from "next/cache";
import { getLocale } from "@/lib/i18n-server";
import { text } from "@/lib/i18n";
import type { FormState } from "@/lib/types";
import { shiftDate, workweek } from "@/lib/workweek";

export async function saveSetting(_: FormState, form: FormData): Promise<FormState> {
  await requireUser(["ADMIN"]);
  const locale = await getLocale();
  try {
    await transaction(async c => {await requireTerm(c,String(form.get("operatingTermId")));await savePickupSetting(c,form);});
    revalidatePath("/schedule");
    revalidatePath("/routes");
    return { ok:true,message:text(locale,"设置已保存，日程预览已更新。","Saved. Schedule preview updated.") };
  } catch (error) {
    return { ok:false,message:error instanceof PickupError ? text(locale,error.zh,error.en) : error instanceof TermError ? error.message : text(locale,"保存失败，请检查必填信息及重复线路。","Could not save. Check required fields and duplicate routes.") };
  }
}

export async function saveRoute(_: FormState, form: FormData): Promise<FormState> {
  await requireUser(["ADMIN"]);
  const locale=await getLocale();
  try {
    await transaction(async c=>{
      await requireTerm(c,String(form.get("operatingTermId")));
      await saveFixedRoute(c,form);
      const today=todayInOperationsTimeZone();
      await materializeRoutes(c,today,today);
    });
    for(const path of ["/routes","/schedule","/","/driver","/parent"]) revalidatePath(path);
    return {ok:true,message:text(locale,"线路已保存。请在每日接送核对查看遗漏和冲突。","Route saved. Review omissions and conflicts in Daily pickup review.")};
  } catch(e) {return {ok:false,message:e instanceof PickupError?text(locale,e.zh,e.en):e instanceof TermError?e.message:text(locale,"保存失败，请检查站点、时间及学生安排。","Could not save. Check stops, times and riders.")};}
}

export async function generateSchedule(_: FormState, form: FormData): Promise<FormState> {
  await requireUser(["ADMIN"]);
  const locale = await getLocale();
  try {
    const today = todayInOperationsTimeZone();
    const mode = String(form.get("mode") ?? "today");
    const custom = String(form.get("date") ?? "");
    const dates = mode === "tomorrow" ? [shiftDate(today, 1)]
      : mode === "next-week" ? workweek(shiftDate(today, 7)).days
      : mode === "custom" && /^\d{4}-\d{2}-\d{2}$/.test(custom) ? [custom]
      : [today];
    await transaction(async c => {
      const term = await requireTerm(c);
      for (const date of dates) {
        if (date < today || date < term.startsOn || date > term.endsOn) throw new Error("Date is outside the active term.");
        await materializeRoutes(c, date, today);
      }
    });
    for (const path of ["/routes", "/schedule/review", "/schedule", "/", "/driver", "/parent"]) revalidatePath(path);
    return { ok: true, message: text(locale, `${dates.length === 1 ? dates[0] : "下周"} 排班已生成。`, `${dates.length === 1 ? dates[0] : "Next week"} schedule generated.`) };
  } catch (error) {
    return { ok: false, message: error instanceof Error && error.message.includes("outside") ? text(locale, "日期不在当前运营学期内。", "The date is outside the active term.") : text(locale, "排班生成失败，请检查日期和配置。", "Could not generate the schedule. Check the date and configuration.") };
  }
}
