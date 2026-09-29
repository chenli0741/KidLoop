import { cookies } from "next/headers";
import { LOGIN_HANDOFF_COOKIE } from "@/lib/login-preferences";

export async function DELETE() {
  (await cookies()).delete(LOGIN_HANDOFF_COOKIE);
  return new Response(null, { status: 204 });
}
