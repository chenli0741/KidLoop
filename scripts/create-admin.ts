// Run with: node --env-file=.env.local --import tsx scripts/create-admin.ts
// Supply KIDLOOP_ADMIN_EMAIL, KIDLOOP_ADMIN_NAME and KIDLOOP_ADMIN_PASSWORD through the environment.
import pg from "pg";
import { hashPassword } from "../src/lib/password";

async function main() {
  const email = process.env.KIDLOOP_ADMIN_EMAIL?.trim().toLowerCase();
  const name = process.env.KIDLOOP_ADMIN_NAME?.trim();
  const password = process.env.KIDLOOP_ADMIN_PASSWORD;
  if (!email || !name || !password || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Set KIDLOOP_ADMIN_EMAIL, KIDLOOP_ADMIN_NAME and KIDLOOP_ADMIN_PASSWORD (6–128 characters).");
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (url.searchParams.get("sslmode") === "require") url.searchParams.set("sslmode", "verify-full");
  const pool = new pg.Pool({ connectionString: url.toString() });
  try {
    const hash = await hashPassword(password);
    await pool.query("insert into app_users (email, name, role, password_hash) values ($1, $2, 'ADMIN', $3)", [email, name, hash]);
    console.log("Administrator created. Sign in at /login.");
  } finally { await pool.end(); }
}
main().catch(() => { console.error("Administrator not created. Check the supplied environment, password length, migrations, and whether the email already exists."); process.exitCode = 1; });
