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
      const dates=(await c.query<{date:string}>("select distinct scheduled_date::text as date from trips where fixed_route_id is not null and scheduled_date >= $1",[today])).rows.map(r=>r.date);
      for(const date of [...new Set([today,...dates])].sort()) await materializeRoutes(c,date,today);
    });
    for(const path of ["/routes","/schedule","/","/driver","/parent"]) revalidatePath(path);
    return {ok:true,message:text(locale,"固定线路已保存。启用后每日任务自动生成。","Route saved. Enabled routes generate daily tasks automatically.")};
  } catch(e) {return {ok:false,message:e instanceof PickupError?text(locale,e.zh,e.en):e instanceof TermError?e.message:text(locale,"保存失败，请检查站点、时间及学生安排。","Could not save. Check stops, times and riders.")};}
}
