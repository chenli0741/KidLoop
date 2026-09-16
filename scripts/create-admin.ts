// Run with: node --env-file=.env.local --import tsx scripts/create-admin.ts
// Supply KIDLOOP_ADMIN_EMAIL, KIDLOOP_ADMIN_NAME and KIDLOOP_ADMIN_PASSWORD through the environment.
import pg from "pg";
import { hashPassword } from "../src/lib/password";

async function main() {
  const email = process.env.KIDLOOP_ADMIN_EMAIL?.trim().toLowerCase();
  const name = process.env.KIDLOOP_ADMIN_NAME?.trim();
  const password = process.env.KIDLOOP_ADMIN_PASSWORD;
  if (!email || !name || !password || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Set KIDLOOP_ADMIN_EMAIL, KIDLOOP_ADMIN_NAME and KIDLOOP_ADMIN_PASSWORD (6–128 characters).");
  const tenant=process.env.KIDLOOP_TENANT_ID;
  if(!tenant||!/^[a-f0-9-]{36}$/i.test(tenant))throw new Error("Set KIDLOOP_TENANT_ID explicitly");
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (url.searchParams.get("sslmode") === "require") url.searchParams.set("sslmode", "verify-full");
  const pool = new pg.Pool({ connectionString: url.toString() });
  try {
    const hash = await hashPassword(password);
    const c=await pool.connect();
    try {
      await c.query('begin');
      if(!(await c.query('select 1 from tenants where id=$1 and active',[tenant])).rowCount)throw new Error('Institution unavailable');
      await c.query('insert into login_accounts(email,name,password_hash) values($1,$2,$3) on conflict(email) do nothing',[email,name,hash]);
      const account=(await c.query('select id from login_accounts where email=$1 and active',[email])).rows[0];
      if(!account)throw new Error('Account unavailable');
      await c.query("select set_config('kidloop.tenant_id',$1,true)",[tenant]);
      await c.query("insert into app_users(tenant_id,account_id,email,name,role) values($1,$2,$3,$4,'ADMIN')",[tenant,account.id,email,name]);
      await c.query('commit');
    }catch(e){await c.query('rollback');throw e;}finally{c.release();}
    console.log("Administrator created. Sign in at /login.");
  } finally { await pool.end(); }
}
main().catch(() => { console.error("Administrator not created. Check the supplied environment, password length, migrations, and whether the email already exists."); process.exitCode = 1; });
