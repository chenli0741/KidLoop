"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { getSessionHash } from "@/lib/identity";
import { startCompanyMail, finishCompanyMail, disconnectCompanyMail } from "@/lib/company-mail/service";
import { MailError } from "@/lib/connected-mail/types";

const failure = (error: unknown) => ({ ok: false as const, error: error instanceof MailError ? error.code : "PROVIDER_ERROR" as const });
export async function connectGmail(native: boolean) {
  const admin = await requireUser(["ADMIN"], true);
  try {
    const session = await getSessionHash();
    if (!session || typeof native !== "boolean") throw new MailError("INVALID_FLOW");
    return { ok: true as const, ...await startCompanyMail(admin, native) };
  } catch (error) { return failure(error); }
}
export async function completeGmail(state: string, proof: string) {
  const admin = await requireUser(["ADMIN"], true);
  try {
    const session = await getSessionHash();
    if (!session || typeof state !== "string" || typeof proof !== "string") throw new MailError("INVALID_FLOW");
    const email = await finishCompanyMail(admin, state, proof);
    revalidatePath("/organizations");
    return { ok: true as const, email };
  } catch (error) { return failure(error); }
}
export async function disconnectGmail(revision: string) {
  const admin = await requireUser(["ADMIN"], true);
  try {
    if (typeof revision !== "string") throw new MailError("INVALID_FLOW");
    await disconnectCompanyMail(admin, revision);
    revalidatePath("/organizations");
    return { ok: true as const };
  } catch (error) { return failure(error); }
}
