import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import pg from "pg";
import sharp from "sharp";

const manifestPath = process.argv[2];
if (!manifestPath) throw new Error("Usage: node --env-file=.env.local scripts/import-roster.mjs <manifest.json> [--apply]");
const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
const apply = process.argv.includes("--apply");
if (!manifest.batch || !manifest.students?.length) throw new Error("A batch ID and students are required");
const names = new Set();
for (const student of manifest.students) {
  if (!student.name || typeof student.grade !== "string" || !student.classroom || names.has(student.name)) {
    throw new Error("Every student must have a unique name, grade string (empty if unknown), and classroom");
  }
  names.add(student.name);
}
const previewDir = path.join(path.dirname(manifestPath), "preview", manifest.batch);
await fs.mkdir(previewDir, { recursive: true });
const prepared = [];
for (const [index, student] of manifest.students.entries()) {
  if (!student.crop) {
    prepared.push({ ...student, photoUrl: "" });
    continue;
  }
  const photo = await sharp(path.join(manifest.sourceDirectory, manifest.photoSheet))
    .extract(student.crop).jpeg({ quality: 90 }).toBuffer();
  await fs.writeFile(path.join(previewDir, `${index + 1}.jpg`), photo);
  prepared.push({ ...student, photoUrl: `data:image/jpeg;base64,${photo.toString("base64")}` });
}

function idFor(kind, key) {
  const hex = createHash("sha256").update(`${manifest.batch}:${kind}:${key}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
const url = new URL(process.env.DATABASE_URL);
if (url.searchParams.get("sslmode") === "require") url.searchParams.set("sslmode", "verify-full");
const pool = new pg.Pool({ connectionString: url.toString() });
const client = await pool.connect();
try {
  await client.query("begin");
  await client.query("select pg_advisory_xact_lock(hashtext($1))", ["kidloop-roster-import"]);
  async function existingId(table, name) {
    const result = await client.query(`select id from ${table} where lower(name) = lower($1)`, [name]);
    if (result.rowCount > 1) throw new Error(`Ambiguous existing ${table} name`);
    return result.rows[0]?.id;
  }
  let schoolId = await existingId("schools", manifest.school.name);
  if (!schoolId) {
    schoolId = idFor("school", manifest.school.name);
    await client.query("insert into schools (id,name,address,dismissal_time,pickup_instructions) values ($1,$2,$3,$4,$5)",
      [schoolId, manifest.school.name, manifest.school.address, manifest.school.dismissalTime, manifest.school.instructions]);
  }
  let programId = await existingId("after_school_programs", manifest.program.name);
  if (!programId) {
    programId = idFor("program", manifest.program.name);
    await client.query("insert into after_school_programs (id,name,address,dropoff_info) values ($1,$2,$3,$4)",
      [programId, manifest.program.name, manifest.program.address, manifest.program.dropoffInfo]);
  }
  let inserted = 0;
  let skipped = 0;
  for (const student of prepared) {
    const existing = await client.query("select st.id from students st join classrooms c on c.id=st.classroom_id where c.school_id=$1 and lower(st.name)=lower($2)", [schoolId, student.name]);
    if (existing.rowCount) { skipped++; continue; }
    await client.query("insert into classrooms (school_id,name) values ($1,$2) on conflict (school_id,name) do nothing", [schoolId, student.classroom]);
    const classroom = await client.query("select id from classrooms where school_id=$1 and name=$2", [schoolId, student.classroom]);
    const notes = JSON.stringify({ kind: "historical-test-data", batch: manifest.batch, sources: [manifest.photoSheet, ...manifest.rosterSources].filter(Boolean), missing: ["age", "parent contact", ...(!student.photoUrl ? ["photo"] : []), ...(!student.grade ? ["grade"] : [])], note: student.notes ?? "" });
    await client.query("insert into students (id,classroom_id,parent_id,program_id,name,photo_url,grade,age,notes) values ($1,$2,null,$3,$4,$5,$6,null,$7)",
      [idFor("student", student.name), classroom.rows[0].id, programId, student.name, student.photoUrl, student.grade, notes]);
    inserted++;
  }
  const verified = await client.query("select count(*)::int as count, count(*) filter (where st.photo_url like 'data:image/jpeg;base64,%')::int as photos from students st join classrooms c on c.id=st.classroom_id where c.school_id=$1 and st.name=any($2::text[])", [schoolId, [...names]]);
  if (verified.rows[0].count !== prepared.length || verified.rows[0].photos !== prepared.filter((student) => student.photoUrl).length) throw new Error("Photo/roster verification failed");
  await client.query(apply ? "commit" : "rollback");
  console.log(JSON.stringify({ mode: apply ? "applied" : "dry-run (rolled back)", inserted, skipped, verifiedStudents: verified.rows[0].count, verifiedPhotos: verified.rows[0].photos, previewDir }));
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  client.release();
  await pool.end();
}
