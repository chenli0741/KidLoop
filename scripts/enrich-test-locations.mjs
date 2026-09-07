import fs from "node:fs/promises";
import pg from "pg";

const data = JSON.parse(await fs.readFile(new URL("../docs/test-location-sources.json", import.meta.url), "utf8"));
const url = new URL(process.env.DATABASE_URL);
if (url.searchParams.get("sslmode") === "require") url.searchParams.set("sslmode", "verify-full");
const pool = new pg.Pool({ connectionString: url.toString() });
const client = await pool.connect();
try {
  await client.query("begin");
  await client.query("select pg_advisory_xact_lock(hashtext($1))", ["kidloop-roster-import"]);
  const marker = '%"batch":"historical-roster-20260907-%';
  for (const school of data.schools) {
    const result = await client.query(`update schools sc set address=$2,dismissal_time=$3,pickup_instructions=$4,updated_at=now()
      where sc.name=$1 and exists (select 1 from classrooms c join students st on st.classroom_id=c.id where c.school_id=sc.id and st.notes like $5) returning id`,
      [school.name, school.address, school.dismissalTime, school.instructions, marker]);
    if (result.rowCount !== 1) throw new Error(`Expected one imported school: ${school.name}`);
  }
  for (const program of data.programs) {
    const result = await client.query(`update after_school_programs p set address=$2,dropoff_info=$3,updated_at=now()
      where p.name=$1 and exists (select 1 from students st where st.program_id=p.id and st.notes like $4) returning id`,
      [program.name, program.address, program.dropoffInfo, marker]);
    if (result.rowCount !== 1) throw new Error(`Expected one imported program: ${program.name}`);
  }
  await client.query("commit");
  console.log(JSON.stringify({ schools: data.schools.length, programs: data.programs.length, pending: data.pending.length }));
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  client.release();
  await pool.end();
}
