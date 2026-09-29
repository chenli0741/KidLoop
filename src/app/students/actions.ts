"use server";

import { requireTerm } from "@/lib/operating-terms";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { transaction } from "@/lib/db";
import { getLocale } from "@/lib/i18n-server";
import { text } from "@/lib/i18n";
import { archiveStudent, saveStudent, StudentEditError } from "@/lib/student-management";
import type { FormState } from "@/lib/types";
import { addStudentServicePeriod, endStudentServices, StudentServicePeriodError } from "@/lib/student-service-periods";
import { todayInOperationsTimeZone } from "@/lib/date";
import { materializeRoutes } from "@/lib/fixed-routes";

async function mutate(form: FormData, deleting: boolean): Promise<FormState> {
  const user = await requireUser(["ADMIN"], true);
  const locale = await getLocale();
  try {
    await transaction(async client => {
      const term=await requireTerm(client,String(form.get("operatingTermId")));
      if(!(await client.query('select 1 from term_students where operating_term_id=$1 and student_id=$2',[term.id,String(form.get("id"))])).rowCount)throw new StudentEditError('missing');
      return deleting ? archiveStudent(client,form) : saveStudent(client,form,user.id);
    });
    for (const path of ["/students", "/", "/routes", "/schedule", "/schedule/dispatch", "/parent", "/driver"]) revalidatePath(path);
    return { ok: true, message: deleting ? text(locale, "学生已移出名册。", "Student removed from roster.") : text(locale, "学生资料已保存。", "Student saved.") };
  } catch (error) {
    const messages: Record<string, [string, string]> = {
      invalid: ["请检查姓名、班级和课外班等信息。", "Please check the name, class and program."],
      age: ["年龄须为 3 到 20 的整数，也可以留空。", "Age must be an integer from 3 to 20, or empty."],
      photo: ["请输入有效的 http/https 照片链接；移除照片时请清空链接。", "Enter a valid HTTP(S) photo URL; clear the URL when removing the photo."],
      email: ["请输入有效的邮箱地址。", "Enter a valid email address."],
      missing: ["该学生已被删除，请刷新页面。", "This student was removed. Refresh the page."],
      stale: ["资料已发生变化，请刷新页面后重新编辑。", "Details have changed. Refresh before editing again."],
      assigned: ["该学生有未完成行程，请先完成或取消行程，再更换学校或课外班。", "Complete or cancel the student's open trips before changing school or program."],
    };
    const message = error instanceof StudentEditError ? messages[error.message] : undefined;
    if (!message) console.error("Student mutation failed", error);
    return { ok: false, message: message ? text(locale, ...message) : text(locale, "保存失败，请重试。", "Could not save. Please try again.") };
  }
}

export async function updateStudent(form: FormData) { return mutate(form, false); }
export async function deleteStudent(form: FormData) { return mutate(form, true); }

function selectedStudents(form: FormData) {
  return form.getAll("studentIds").filter((value): value is string => typeof value === "string");
}

async function mutateServicePeriods(form: FormData, mode: "end" | "add"): Promise<FormState> {
  const user = await requireUser(["ADMIN"], true);
  const locale = await getLocale();
  try {
    await transaction(async client => {
      const term = await requireTerm(client, String(form.get("operatingTermId")));
      const ids = selectedStudents(form);
      const today = todayInOperationsTimeZone();
      if (mode === "end") await endStudentServices(client, term, ids, String(form.get("lastServiceDate") ?? ""), today);
      else await addStudentServicePeriod(client, term, ids, String(form.get("startsOn") ?? ""), String(form.get("endsOn") ?? ""), user.id, today);
      // Existing future snapshots update immediately; dates never generated before remain read-driven.
      const dates = await client.query<{date:string}>(`select distinct scheduled_date::text as date from trips
        where operating_term_id=$1 and scheduled_date>=$2::date order by 1`, [term.id, today]);
      for (const {date} of dates.rows) await materializeRoutes(client, date, today);
    });
    for (const path of ["/students", "/", "/routes", "/schedule", "/schedule/dispatch", "/parent", "/driver"]) revalidatePath(path);
    return { ok: true, message: mode === "end" ? text(locale, "截止日期已保存。", "End date saved.") : text(locale, "接送期间已添加。", "Service period added.") };
  } catch (error) {
    const messages: Record<string, [string,string]> = {
      date: ["请选择当前学期内的有效日期。", "Choose valid dates in the current term."],
      students: ["请选择有效的学生。", "Select valid students."],
      period: ["截止日期不在该学生现有接送期间内。", "The end date is outside the student's current service period."],
      overlap: ["新接送期间与已有期间重叠。", "The new service period overlaps an existing period."],
    };
    const message = error instanceof StudentServicePeriodError ? messages[error.message] : undefined;
    if (!message) console.error("Student service period mutation failed", error);
    return { ok: false, message: message ? text(locale, ...message) : text(locale, "保存失败，请重试。", "Could not save. Please try again.") };
  }
}

export async function endStudentServicePeriods(_: FormState, form: FormData) { return mutateServicePeriods(form, "end"); }
export async function addStudentServicePeriods(_: FormState, form: FormData) { return mutateServicePeriods(form, "add"); }
