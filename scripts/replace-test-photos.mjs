import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import pg from "pg";

// Only imported historical test records with existing photos are eligible.
const apply = process.argv.includes("--apply");
const restoreIndex = process.argv.indexOf("--restore");
const restoreFile = restoreIndex >= 0 ? process.argv[restoreIndex + 1] : null;
if (restoreIndex >= 0 && !restoreFile) throw new Error("--restore requires a backup file");
const url = new URL(process.env.DATABASE_URL);
if (url.searchParams.get("sslmode") === "require") url.searchParams.set("sslmode", "verify-full");
const pool = new pg.Pool({ connectionString: url.toString() });
const client = await pool.connect();
try {
  const avatars = await Promise.all(["student-teal.png", "student-glasses.png"].map(async name =>
    `data:image/png;base64,${(await fs.readFile(path.join("public/demo-avatars", name))).toString("base64")}`));
  await client.query("begin");
  await client.query("select pg_advisory_xact_lock(hashtext($1))", ["kidloop-roster-import"]);
  const rows = (await client.query("select id,photo_url,notes from students order by id for update")).rows;
  const eligible = rows.filter(row => {
    try { return JSON.parse(row.notes).kind === "historical-test-data" && !!row.photo_url; }
    catch { return false; }
  });
  let changes;
  if (restoreFile) {
    const backup = JSON.parse(await fs.readFile(restoreFile, "utf8"));
    if (backup.kind !== "kidloop-test-photo-backup-v1" || !Array.isArray(backup.records)) throw new Error("Invalid backup");
    changes = backup.records.map(record => {
      const current = eligible.find(row => row.id === record.id);
      if (!current || current.photo_url !== record.replacement) throw new Error("Photo changed since replacement; restore aborted");
      return { id: record.id, original: current.photo_url, replacement: record.original };
    });
  } else {
    changes = eligible.filter(row => !avatars.includes(row.photo_url)).map(row => ({
      id: row.id, original: row.photo_url,
      replacement: avatars[createHash("sha256").update(row.id).digest()[0] % avatars.length],
    }));
  }
  let backupPath;
  if (apply && changes.length && !restoreFile) {
    await fs.mkdir(".local-data/photo-backups", { recursive: true, mode: 0o700 });
    backupPath = path.resolve(".local-data/photo-backups", `${new Date().toISOString().replaceAll(":", "-")}.json`);
    await fs.writeFile(backupPath, JSON.stringify({kind:"kidloop-test-photo-backup-v1",records:changes}), {mode:0o600,flag:"wx"});
  }
  for (const change of changes) {
    const result = await client.query("update students set photo_url=$2,updated_at=clock_timestamp() where id=$1 and photo_url=$3 returning id", [change.id,change.replacement,change.original]);
    if (result.rowCount !== 1) throw new Error("Concurrent photo change");
  }
  const verified = (await client.query("select id,photo_url from students where id=any($1::uuid[])", [changes.map(c=>c.id)])).rows;
  if (verified.some(row => row.photo_url !== changes.find(c=>c.id===row.id)?.replacement)) throw new Error("Photo verification failed");
  await client.query(apply ? "commit" : "rollback");
  console.log(JSON.stringify({mode:apply?"applied":"dry-run",operation:restoreFile?"restore":"replace",eligible:eligible.length,changed:changes.length,backupPath}));
} catch (error) {
  await client.query("rollback");
  throw error;
} finally { client.release(); await pool.end(); }
