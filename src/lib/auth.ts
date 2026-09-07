import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { query } from "@/lib/db";
import { tokenHash } from "@/lib/password";
import type { AuthUser, UserRole } from "@/lib/types";

export const SESSION_COOKIE = "kidloop_session";

export const getUser = cache(async (): Promise<AuthUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const result = await query<AuthUser>(`
    select u.id, u.email, u.name, u.role, u.driver_id as "driverId"
    from user_sessions s join app_users u on u.id = s.user_id
    where s.token_hash = $1 and s.expires_at > now() and u.active = true
  `, [tokenHash(token)]);
  return result.rows[0] ?? null;
});

export function homeFor(role: UserRole) {
  return role === "PARENT" ? "/parent" : role === "DRIVER" ? "/driver" : "/";
}

export async function requireUser(roles?: UserRole[]) {
  const user = await getUser();
  if (!user) redirect("/login");
  if (roles && !roles.includes(user.role)) redirect(homeFor(user.role));
  return user;
}
