import "server-only";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
// Privileged connection: identity/organization lifecycle only. Business code imports db.ts.
declare global { var kidloopPool: Pool | undefined; }
function createPool() {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("DATABASE_URL is not configured");
  const url = new URL(value);
  if (url.searchParams.get("sslmode") === "require") url.searchParams.set("sslmode", "verify-full");
  return new Pool({ connectionString: url.toString(), max: 10 });
}
export const identityPool = global.kidloopPool ?? createPool();
if (process.env.NODE_ENV !== "production") global.kidloopPool = identityPool;
export function identityQuery<T extends QueryResultRow>(sql: string, values: unknown[] = []) {
  return identityPool.query<T>(sql, values);
}
export async function identityTransaction<T>(work: (c: PoolClient) => Promise<T>) {
  const c = await identityPool.connect();
  try { await c.query("begin"); const value = await work(c); await c.query("commit"); return value; }
  catch (error) { await c.query("rollback"); throw error; }
  finally { c.release(); }
}
