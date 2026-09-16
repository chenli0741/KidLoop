import "server-only";
import type { PoolClient, QueryResultRow } from "pg";
import { identityPool } from "./identity-db";
import { getUser, assertWorkspaceRequest } from "./auth";

export async function transaction<T>(work: (client: PoolClient) => Promise<T>) {
  const user = await getUser();
  if (!user?.tenantId) throw new Error("An active institution is required");
  await assertWorkspaceRequest(user);
  const client = await identityPool.connect();
  try {
    await client.query("begin");
    // Revalidate inside the transaction; stale/disabled memberships fail closed.
    const allowed = await client.query(`select 1 from app_users u join tenants t on t.id=u.tenant_id
      join login_accounts a on a.id=u.account_id
      join user_sessions us on us.user_id=u.id
      join account_sessions s on s.token_hash=us.token_hash and s.account_id=a.id and s.selected_tenant_id=t.id
      where u.id=$1 and u.account_id=$2 and u.tenant_id=$3 and u.active and t.active and a.active
      and s.context_key=$4 and s.expires_at>now() and us.expires_at>now()
      and u.role=$5 and u.driver_id is not distinct from $6::uuid
      for share of u,t,a,s,us`, [user.id,user.accountId,user.tenantId,user.contextKey,user.role,user.driverId]);
    if (!allowed.rowCount) throw new Error("Institution access revoked");
    await client.query("set local role kidloop_runtime");
    await client.query("select set_config('kidloop.tenant_id',$1,true)", [user.tenantId]);
    await client.query("select set_config('kidloop.actor_id',$1,true)",[user.id]);
    const result = await work(client);
    await client.query("commit");
    return result;
  } catch (error) { await client.query("rollback"); throw error; }
  finally { client.release(); }
}
export function query<T extends QueryResultRow>(sql: string, values: unknown[] = []) {
  return transaction(client => client.query<T>(sql, values));
}
// Pool-like read interface, without an unscoped connection escape hatch.
export const db = { query };
