import "server-only";
import { escapeLiteral, type PoolClient, type QueryResult } from "pg";
import type { AuthUser } from "./types";

/** One wire round trip for setup, while keeping permission locks until commit. */
export async function tenantTransaction<T>(client: PoolClient, user: AuthUser, work: (client: PoolClient) => Promise<T>) {
  if (!user.tenantId || !user.accountId || !user.contextKey) throw new Error("An active institution is required");
  // Simple-protocol batches cannot bind parameters. Escape every value with pg;
  // no caller-provided SQL is accepted in the setup batch.
  const literal = (value: string | null | undefined) => value == null ? "null" : escapeLiteral(value);
  try {
    const setup = await client.query(`begin;
      select set_config('kidloop.tenant_id',${literal(user.tenantId)},true),
             set_config('kidloop.actor_id',${literal(user.id)},true)
      from app_users u join tenants t on t.id=u.tenant_id
      join login_accounts a on a.id=u.account_id
      join user_sessions us on us.user_id=u.id
      join account_sessions s on s.token_hash=us.token_hash and s.account_id=a.id and s.selected_tenant_id=t.id
      where u.id=${literal(user.id)}::uuid and u.account_id=${literal(user.accountId)}::uuid
      and u.tenant_id=${literal(user.tenantId)}::uuid and u.active and t.active and a.active
      and s.context_key=${literal(user.contextKey)}::uuid and s.expires_at>now() and us.expires_at>now()
      and u.role=${literal(user.role)} and u.driver_id is not distinct from ${literal(user.driverId)}::uuid
      for share of u,t,a,s,us;
      set local role kidloop_runtime`) as unknown as QueryResult[];
    if (setup[1]?.rowCount !== 1) throw new Error("Institution access revoked");
    const result = await work(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}
