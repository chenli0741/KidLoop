import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { identityQuery } from "./identity-db";
import { tokenHash } from "./password";
export const SESSION_COOKIE = "kidloop_session";
export const getIdentity = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const hash = tokenHash(token);
  const row = (await identityQuery<{id:string;email:string;name:string;tenantId:string|null;contextKey:string}>(`
    select a.id,a.email,a.name,s.selected_tenant_id as "tenantId",s.context_key as "contextKey"
    from account_sessions s join login_accounts a on a.id=s.account_id
    where s.token_hash=$1 and s.expires_at>now() and a.active`, [hash])).rows[0];
  return row ? { ...row, sessionHash: hash } : null;
});
export async function requireIdentity() {
  const account = await getIdentity();
  if (!account) redirect("/login");
  return account;
}
