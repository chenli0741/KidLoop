import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = await fs.readFile(path.join(root, ".env.local"), "utf8");
const match = envFile.match(/^DATABASE_URL=["']?(.+?)["']?\s*$/m);

if (!match?.[1]) {
  throw new Error("DATABASE_URL is missing from .env.local");
}

const migrationsDir = path.join(root, "db", "migrations");
const files = (await fs.readdir(migrationsDir)).filter((name) => name.endsWith(".sql")).sort();
const databaseUrl = new URL(match[1]);
if (databaseUrl.searchParams.get("sslmode") === "require") {
  databaseUrl.searchParams.set("sslmode", "verify-full");
}
const pool = new pg.Pool({ connectionString: databaseUrl.toString() });
const client = await pool.connect();

try {
  await client.query(`
    create table if not exists kidloop_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )
  `);

  for (const file of files) {
    const applied = await client.query("select 1 from kidloop_migrations where name = $1", [file]);
    if (applied.rowCount) continue;

    const sql = await fs.readFile(path.join(migrationsDir, file), "utf8");
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query("insert into kidloop_migrations (name) values ($1)", [file]);
      await client.query("commit");
      process.stdout.write(`Applied ${file}\n`);
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  }
} finally {
  client.release();
  await pool.end();
}
