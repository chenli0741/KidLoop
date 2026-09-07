import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
export default async function LegacyDispatchPage() { await requireUser(["ADMIN"]); redirect("/schedule?tab=routes"); }
