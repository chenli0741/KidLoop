import "server-only";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { federalHolidays } from "./federal-holidays";
import { validServiceDate } from "./day-plans";
import { PICKUP_GRADES } from "./pickup-grades";
export type OperatingTerm = {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
  status: string;
};
export class TermError extends Error {}
export async function openTerm(
  c: Pick<PoolClient, "query">,
): Promise<OperatingTerm | undefined> {
  return (
    await c.query(
      `select id,name,starts_on::text as "startsOn",ends_on::text as "endsOn",status from operating_terms where status='OPEN'`,
    )
  ).rows[0];
}
export async function requireTerm(c: PoolClient, expected?: string) {
  await c.query("select pg_advisory_xact_lock(70919009)");
  const t = await openTerm(c);
  if (!t || (expected !== undefined && expected !== t.id))
    throw new TermError(
      "工作学期已变化，请刷新 / Working term changed; refresh",
    );
  return t;
}
export async function initializeSchools(c: PoolClient, t: OperatingTerm) {
  const schools = (
    await c.query("select id from schools order by id for update")
  ).rows;
  for (const s of schools) {
    const added = await c.query(
      "insert into school_terms(school_id,name,starts_on,ends_on,operating_term_id) values($1,$2,$3,$4,$5) on conflict(operating_term_id,school_id) where operating_term_id is not null do nothing returning id",
      [s.id, t.name, t.startsOn, t.endsOn, t.id],
    );
    if (!added.rowCount) continue;
    for (const h of federalHolidays(t.startsOn, t.endsOn))
      await c.query(
        "insert into school_calendar_exceptions(school_id,name,starts_on,ends_on,operating_term_id) values($1,$2,$3,$3,$4)",
        [s.id, h.name, h.date, t.id],
      );
  }
}
export async function createOperatingTerm(c: PoolClient, f: FormData) {
  await c.query("select pg_advisory_xact_lock(70919009)");
  if (await openTerm(c))
    throw new TermError("请先归档当前学期 / Archive the current term first");
  const name = String(f.get("name") ?? "").trim(),
    start = String(f.get("startsOn")),
    end = String(f.get("endsOn")),
    source = String(f.get("source") ?? "");
  if (
    !name ||
    name.length > 100 ||
    !validServiceDate(start) ||
    !validServiceDate(end) ||
    start > end ||
    Date.parse(end) - Date.parse(start) > 550 * 86400000 ||
    start < "2021-01-01"
  )
    throw new TermError("请填写有效名称与日期 / Enter valid name and dates");
  if (
    (await c.query("select 1 from operating_terms where ends_on>=$1", [start]))
      .rowCount
  )
    throw new TermError(
      "新学期须在上期结束之后 / Start after the previous term ends",
    );
  const old = source
    ? (
        await c.query(
          "select id,snapshot from operating_terms where id=$1 and status='ARCHIVED'",
          [source],
        )
      ).rows[0]
    : null;
  if (source && !old)
    throw new TermError("来源学期不存在 / Source term unavailable");
  const id = (
    await c.query(
      "insert into operating_terms(name,starts_on,ends_on) values($1,$2,$3) returning id",
      [name, start, end],
    )
  ).rows[0].id;
  const t = (await openTerm(c))!;
  await initializeSchools(c, t);
  if (old) {
    await c.query(
      `insert into school_pickup_rules(school_id,name,weekdays,pickup_time,grades,operating_term_id)
       select school_id,name,weekdays,pickup_time,
         array(select g from unnest(grades) with ordinality as items(g,position) where g=any($3::text[]) order by position),$2
       from school_pickup_rules where operating_term_id=$1 and grades && $3::text[]`,
      [source, id, PICKUP_GRADES],
    );
    await c.query(
      `insert into term_students(operating_term_id,student_id,reviewed,previous_grade,previous_classroom_id)
   select $2,s.id,false,h->>'grade',(h->>'classroom_id')::uuid
   from operating_terms ot cross join lateral jsonb_array_elements(ot.snapshot->'students') h
   join students s on s.id=(h->>'id')::uuid where ot.id=$1 and s.active`,
      [source, id],
    );
    const routes = (
      await c.query("select * from fixed_routes where operating_term_id=$1", [
        source,
      ])
    ).rows;
    for (const r of routes) {
      const next = (
        await c.query(
          "insert into fixed_routes(name,starts_on,ends_on,weekdays,enabled,operating_term_id) values($1,$2,$3,$4,false,$5) returning id",
          [r.name, start, end, r.weekdays, id],
        )
      ).rows[0].id;
      const stops = (
        await c.query(
          "select * from fixed_route_stops where route_id=$1 order by position",
          [r.id],
        )
      ).rows;
      const map = new Map<string, string>();
      for (const s of stops) {
        const stop = randomUUID();
        map.set(s.id, stop);
        await c.query(
          "insert into fixed_route_stops(id,route_id,position,school_id,program_id,name,address,arrival_time) values($1,$2,$3,$4,$5,$6,$7,$8)",
          [
            stop,
            next,
            s.position,
            s.school_id,
            s.program_id,
            s.name,
            s.address,
            s.arrival_time,
          ],
        );
      }
      for (const a of (
        await c.query(
          "select a.* from fixed_route_students a join term_students ts on ts.student_id=a.student_id and ts.operating_term_id=$2 where a.route_id=$1",
          [r.id, id],
        )
      ).rows)
        await c.query("insert into fixed_route_students values($1,$2,$3,$4)", [
          next,
          a.student_id,
          map.get(a.pickup_stop_id),
          map.get(a.dropoff_stop_id),
        ]);
    }
  }
  return t;
}
export async function archiveOperatingTerm(
  c: PoolClient,
  id: string,
  today: string,
) {
  const t = await requireTerm(c, id);
  if (t.endsOn >= today)
    throw new TermError("学期结束后才能归档 / Archive after the term ends");
  await c.query(
    "select id from students where id in(select student_id from term_students where operating_term_id=$1) order by id for update",
    [id],
  );
  await c.query(
    "select id from trips where operating_term_id=$1 order by id for update",
    [id],
  );
  const snapshot: Record<string, unknown> = { term: t };
  for (const table of [
    "school_terms",
    "school_pickup_rules",
    "school_calendar_exceptions",
    "fixed_routes",
    "trips",
  ])
    snapshot[table] = (
      await c.query(`select * from ${table} where operating_term_id=$1`, [id])
    ).rows;
  snapshot.schools = (await c.query("select * from schools")).rows;
  snapshot.programs = (
    await c.query("select * from after_school_programs")
  ).rows;
  snapshot.students = (
    await c.query(
      "select s.*,c.name as classroom_name,sc.name as school_name,p.name as program_name,ts.reviewed from term_students ts join students s on s.id=ts.student_id join classrooms c on c.id=s.classroom_id join schools sc on sc.id=c.school_id join after_school_programs p on p.id=s.program_id where ts.operating_term_id=$1",
      [id],
    )
  ).rows;
  snapshot.stops = (
    await c.query(
      "select s.* from fixed_route_stops s join fixed_routes r on r.id=s.route_id where r.operating_term_id=$1",
      [id],
    )
  ).rows;
  snapshot.route_students = (
    await c.query(
      "select s.* from fixed_route_students s join fixed_routes r on r.id=s.route_id where r.operating_term_id=$1",
      [id],
    )
  ).rows;
  snapshot.riders = (
    await c.query(
      "select ts.* from trip_students ts join trips t on t.id=ts.trip_id where t.operating_term_id=$1",
      [id],
    )
  ).rows;
  snapshot.shifts = (await c.query(
    "select sh.* from driver_shifts sh where exists(select 1 from trips t where t.shift_id=sh.id and t.operating_term_id=$1)",[id]
  )).rows;
  snapshot.route_issues = (await c.query(
    "select i.* from route_task_issues i join fixed_routes r on r.id=i.route_id where r.operating_term_id=$1",[id]
  )).rows;
  snapshot.history = (
    await c.query(
      "select h.* from status_history h join trip_students ts on ts.id=h.trip_student_id join trips t on t.id=ts.trip_id where t.operating_term_id=$1",
      [id],
    )
  ).rows;
  snapshot.segment_completions = (await c.query(
    'select s.* from trip_segment_completions s join trips t on t.id=s.trip_id where t.operating_term_id=$1',[id]
  )).rows;
  snapshot.day_plans = (
    await c.query(
      "select dp.* from student_day_plan_history dp where service_date between $1 and $2 and student_id in (select student_id from term_students where operating_term_id=$3)",
      [t.startsOn, t.endsOn, id],
    )
  ).rows;
  snapshot.parents = (
    await c.query(
      "select p.* from parents p where id in(select parent_id from students where id in(select student_id from term_students where operating_term_id=$1))",
      [id],
    )
  ).rows;
  snapshot.current_day_plans = (
    await c.query(
      "select dp.* from student_day_plans dp where service_date between $1 and $2 and student_id in(select student_id from term_students where operating_term_id=$3)",
      [t.startsOn, t.endsOn, id],
    )
  ).rows;
  snapshot.drivers = (await c.query("select id,name,phone from drivers")).rows;
  snapshot.vehicles = (
    await c.query("select id,name,plate,capacity from vehicles")
  ).rows;
  await c.query(
    "update operating_terms set status='ARCHIVED',archived_at=clock_timestamp(),snapshot=$2 where id=$1",
    [id, JSON.stringify(snapshot)],
  );
}
export async function reviewTermStudent(c: PoolClient, f: FormData) {
  const t = await requireTerm(c, String(f.get("operatingTermId"))),
    id = String(f.get("studentId")),
    grade = String(f.get("grade") ?? "").trim(),
    classroom = String(f.get("classroomId") ?? ""),
    program = String(f.get("programId") ?? "");
  if (!grade || grade.length > 30)
    throw new TermError("请核对年级 / Confirm grade");
  const st = (
    await c.query("select id from students where id=$1 and active for update", [
      id,
    ])
  ).rows[0];
  if (!st) throw new TermError("学生不存在 / Student unavailable");
  if (
    (
      await c.query(
        "select 1 from trip_students ts join trips t on t.id=ts.trip_id where student_id=$1 and t.operating_term_id=$2 and t.status not in ('COMPLETED','CANCELED')",
        [id, t.id],
      )
    ).rowCount
  )
    throw new TermError("学生有未完成行程 / Student has unfinished trips");
  if (
    !(await c.query("select id from classrooms where id=$1", [classroom]))
      .rowCount ||
    !(
      await c.query("select id from after_school_programs where id=$1", [
        program,
      ])
    ).rowCount
  )
    throw new TermError("请选择班级和课外班 / Select class and program");
  await c.query(
    "update students set grade=$2,classroom_id=$3,program_id=$4,updated_at=clock_timestamp() where id=$1",
    [id, grade, classroom, program],
  );
  await c.query(
    "insert into term_students(operating_term_id,student_id,reviewed) values($1,$2,true) on conflict(operating_term_id,student_id) do update set reviewed=true",
    [t.id, id],
  );
}
