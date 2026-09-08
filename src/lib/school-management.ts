import 'server-only';
import type { PoolClient } from 'pg';
import { routeName } from './route-name';

export function schoolNames(form: FormData) {
  const name = String(form.get('name') ?? '').trim();
  const shortName = String(form.get('shortName') ?? '').trim();
  if (!name || name.length > 160 || shortName.length > 80) {
    throw new Error('School name must be 1–160 characters and short name at most 80 characters');
  }
  return { name, shortName: shortName || null };
}

// Called under the same advisory lock as route edits. Execution snapshots stay intact.
export async function syncSchoolRouteNames(c: PoolClient, schoolId: string) {
  const affected = await c.query<{ route_id: string }>(`
    update fixed_route_stops s set name=coalesce(sc.short_name,sc.name)
    from schools sc, fixed_routes r
    where sc.id=$1 and s.school_id=sc.id and r.id=s.route_id
      and r.operating_term_id=current_operating_term()
      and s.name is distinct from coalesce(sc.short_name,sc.name)
    returning s.route_id`, [schoolId]);
  for (const id of [...new Set(affected.rows.map(r => r.route_id))].sort()) {
    const stops = await c.query<{ name: string }>('select name from fixed_route_stops where route_id=$1 order by position', [id]);
    const base = routeName(stops.rows);
    let name = base, suffix = 2;
    while ((await c.query('select 1 from fixed_routes where operating_term_id=current_operating_term() and lower(name)=lower($1) and id<>$2', [name,id])).rowCount) name = `${base} (${suffix++})`;
    await c.query('update fixed_routes set name=$2,updated_at=clock_timestamp() where id=$1', [id,name]);
  }
}

export async function updateSchoolNames(c: PoolClient, form: FormData) {
  await c.query('select pg_advisory_xact_lock(70919009)');
  const { name, shortName } = schoolNames(form);
  const result = await c.query(`update schools set name=$3,short_name=$4,updated_at=clock_timestamp()
    where id=$1 and updated_at::text=$2 returning id`, [form.get('id'),form.get('updatedAt'),name,shortName]);
  if (!result.rowCount) throw new Error('School is no longer available at this version. Refresh before saving.');
  await syncSchoolRouteNames(c,result.rows[0].id);
}
