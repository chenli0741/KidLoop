"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { transaction } from "@/lib/db";
import { getLocale } from "@/lib/i18n-server";
import { text } from "@/lib/i18n";
import { archiveStudent, saveStudent, StudentEditError } from "@/lib/student-management";
import type { FormState } from "@/lib/types";

async function mutate(form: FormData, deleting: boolean): Promise<FormState> {
  const user = await requireUser(["ADMIN"]);
  const locale = await getLocale();
  try {
    await transaction((client) => deleting ? archiveStudent(client, form) : saveStudent(client, form, user.id));
    for (const path of ["/students", "/", "/schedule", "/schedule/dispatch", "/parent", "/driver"]) revalidatePath(path);
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
