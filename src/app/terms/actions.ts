"use server";
import { requireUser } from "@/lib/auth";
import { transaction } from "@/lib/db";
import {
  createOperatingTerm,
  archiveOperatingTerm,
  reviewTermStudent,
  TermError,
} from "@/lib/operating-terms";
import { todayInOperationsTimeZone } from "@/lib/date";
import { revalidatePath } from "next/cache";
import type { FormState } from "@/lib/types";
async function run(
  work: Parameters<typeof transaction>[0],
): Promise<FormState> {
  await requireUser(["ADMIN"]);
  try {
    await transaction(work);
    for (const p of [
      "/terms",
      "/schedule",
      "/routes",
      "/students",
      "/",
      "/driver",
      "/parent",
    ])
      revalidatePath(p);
    return { ok: true, message: "已保存 / Saved" };
  } catch (e) {
    return {
      ok: false,
      message:
        e instanceof TermError
          ? e.message
          : "保存失败，请刷新重试 / Could not save; refresh and retry",
    };
  }
}
export async function createTerm(_: FormState, f: FormData) {
  return run((c) => createOperatingTerm(c, f));
}
export async function archiveTerm(_: FormState, f: FormData) {
  return run((c) =>
    archiveOperatingTerm(c, String(f.get("id")), todayInOperationsTimeZone()),
  );
}
export async function reviewStudent(_: FormState, f: FormData) {
  return run((c) => reviewTermStudent(c, f));
}
