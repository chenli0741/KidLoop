import "server-only";
import type { PoolClient, QueryResultRow } from "pg";
import { identityPool } from "./identity-db";
import { getUser, assertWorkspaceRequest } from "./auth";
import { tenantTransaction } from "./tenant-transaction";

export async function transaction<T>(work: (client: PoolClient) => Promise<T>) {
  const user = await getUser();
  if (!user?.tenantId) throw new Error("An active institution is required");
  await assertWorkspaceRequest(user);
  const client = await identityPool.connect();
  try { return await tenantTransaction(client, user, work); }
  finally { client.release(); }
}
export function query<T extends QueryResultRow>(sql: string, values: unknown[] = []) {
  return transaction(client => client.query<T>(sql, values));
}
// Pool-like read interface, without an unscoped connection escape hatch.
export const db = { query };
