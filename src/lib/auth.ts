import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { identityQuery } from "./identity-db";
import { workspaceRequestAllowed } from "./workspace-request";
import { getIdentity, getSessionHash } from "./identity";
import type { AuthUser, UserRole } from "./types";
export { SESSION_COOKIE } from "./identity";
export const getUser = cache(async (): Promise<AuthUser | null> => {
  const sessionHash = await getSessionHash();
  if (!sessionHash) return null;
  return (await identityQuery<AuthUser>(`
    select u.id,a.email,case when u.role='DRIVER' then d.name else u.name end as name,
    u.role,u.driver_id as "driverId",case when u.role='DRIVER' then d.photo_url else u.photo_url end as "photoUrl",
    u.tenant_id as "tenantId",t.name as "tenantName",a.id as "accountId",s.context_key as "contextKey"
    from account_sessions s join login_accounts a on a.id=s.account_id
    join user_sessions us on us.token_hash=s.token_hash
    join app_users u on u.id=us.user_id and u.account_id=a.id and u.tenant_id=s.selected_tenant_id
    join tenants t on t.id=u.tenant_id
    left join drivers d on d.id=u.driver_id and d.tenant_id=u.tenant_id
    where s.token_hash=$1 and s.expires_at>now() and us.expires_at>now() and a.active and u.active and t.active`,
    [sessionHash])).rows[0] ?? null;
});
export function homeFor(role: UserRole) { return role === "PARENT" ? "/parent" : role === "DRIVER" ? "/driver" : "/"; }
export async function assertWorkspaceRequest(user: AuthUser, mutation = false) {
  const h = await headers();
  const context = h.get("x-kidloop-workspace");
  if (!workspaceRequestAllowed(user.contextKey,context,mutation)) {
    throw new Error("登录机构已改变，请刷新页面后重试 / Workspace changed. Reload before continuing.");
  }
}
export async function requireUser(roles?: UserRole[], mutation = false) {
  const user = await getUser();
  if (!user) redirect((await getIdentity()) ? "/organizations" : "/login");
  await assertWorkspaceRequest(user,mutation);
  if (roles && !roles.includes(user.role)) redirect(homeFor(user.role));
  return user;
}
