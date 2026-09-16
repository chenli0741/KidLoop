import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { MailConnectionComplete } from "@/components/mail-connection-complete";
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function CompleteMailPage({ searchParams }: { searchParams: Promise<{ state?: string; failed?: string }> }) {
  await requireUser(["ADMIN"]);
  const parameters = await searchParams;
  const state = typeof parameters.state === "string" && /^[A-Za-z0-9_-]{43}$/.test(parameters.state) ? parameters.state : "";
  return <div className="page-container"><MailConnectionComplete state={state} failed={!state || parameters.failed === "1"}/></div>;
}
