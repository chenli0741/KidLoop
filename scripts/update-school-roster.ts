/** User-confirmed school roster. Dry run by default; never guesses school locations or times. */
import pg from 'pg';
import { initializeSchools, openTerm } from '../src/lib/operating-terms';
import { syncSchoolRouteNames } from '../src/lib/school-management';

const roster = [
  ['Christa McAuliffe Elementary School', 'McAuliffe', ['McAuliffe']],
  ['Cherry Chase Elementary School', 'Cherry Chase', ['Cherry Chase']],
  ['Cumberland Elementary School', 'Cumberland', ['Cumberland']],
  ['Ellis Elementary School', 'Ellis', ['Ellis']],
  ['Stratford School', 'Stratford', ['Stratford']],
  ['John Muir Elementary School', 'John Muir', ['John Muir']],
  ['Murdock-Portal Elementary School', 'Murdock-Portal', ['Murdock-Portal']],
  ['Eaton Elementary School', 'Eaton', ['Eaton']],
] as const;
async function main() {
const url = new URL(process.env.DATABASE_URL!);
if (url.searchParams.get('sslmode') === 'require') url.searchParams.set('sslmode','verify-full');
const c = new pg.Client({connectionString:url.toString()});
await c.connect();
try {
  await c.query('begin');
  await c.query('select pg_advisory_xact_lock(70919009)');
  const before = (await c.query('select id,school_id from students order by id')).rows;
  const executionBefore = (await c.query('select id,updated_at,route_stops from trips order by id')).rows;
  for (const [name, short, aliases] of roster) {
    const matches = await c.query('select id from schools where lower(name)=any($1::text[]) for update', [[name,...aliases].map(n=>n.toLowerCase())]);
    if (matches.rowCount! > 1) throw new Error(`Ambiguous school: ${name}`);
    let id = matches.rows[0]?.id;
    if (id) {
      const result = await c.query('update schools set name=$2,short_name=$3,updated_at=clock_timestamp() where id=$1 and (name is distinct from $2 or short_name is distinct from $3)', [id,name,short]);
      console.log(`${result.rowCount ? 'UPDATE' : 'UNCHANGED'} ${name} → ${short}`);
    } else {
      id = (await c.query("insert into schools(name,short_name,address) values($1,$2,'') returning id", [name,short])).rows[0].id;
      console.log(`ADD ${name} → ${short}`);
    }
    await syncSchoolRouteNames(c as unknown as pg.PoolClient,id);
  }
  const term = await openTerm(c);
  if (term) await initializeSchools(c as unknown as pg.PoolClient,term);
  const after = (await c.query('select id,school_id from students order by id')).rows;
  const executionAfter = (await c.query('select id,updated_at,route_stops from trips order by id')).rows;
  if (JSON.stringify(before)!==JSON.stringify(after) || JSON.stringify(executionBefore)!==JSON.stringify(executionAfter)) throw new Error('Student links or trip snapshots changed');
  console.log('Verified: student school links and trip snapshots unchanged.');
  await c.query(process.argv.includes('--apply') ? 'commit' : 'rollback');
  console.log(process.argv.includes('--apply') ? 'Applied.' : 'Dry run rolled back.');
} catch(e) { await c.query('rollback'); throw e; }
finally { await c.end(); }

}
main().catch(() => { console.error("School roster update failed; transaction rolled back."); process.exitCode = 1; });
