import "server-only";
import type { PoolClient } from "pg";

// An explicit alias is required: PostgreSQL names an OR expression ?column?.
export async function hasDashboardTasks(c: Pick<PoolClient, "query">, date: string) {
  const result = await c.query<{ exists: boolean }>(`select exists(
    select 1 from trips t
    where t.operating_term_id=current_operating_term()
      and t.scheduled_date=$1::date
      and t.fixed_route_id is not null
      and t.status not in ('DRAFT','CANCELED')
  ) or exists(
    select 1 from route_task_issues i where i.service_date=$1::date
  ) as exists`, [date]);
  return result.rows[0]?.exists === true;
}
