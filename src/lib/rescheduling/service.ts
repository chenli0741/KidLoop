import "server-only";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { PoolClient } from "pg";
import { lockRoutes, saveFixedRoute, materializeRoutes } from "../fixed-routes";
import { savePickupSetting } from "../pickup-settings";
import { readSnapshot } from "./snapshot";
import { calculatePlan, validateIntent } from "./planner";
import type { DraftView, Intent, PlanResult, PlannedRoute } from "./types";
import { retireTemporarySources } from "./temporary-replacement";

export async function getDraft(
  c: Pick<PoolClient, "query">,
  id: string,
  userId: string,
): Promise<DraftView> {
  const row = (
    await c.query<DraftView>(
      'select id,revision,status,error,messages,intent,result,applied_candidate as "appliedCandidate" from reschedule_requests where id=$1 and user_id=$2',
      [id, userId],
    )
  ).rows[0];
  if (!row) throw new Error("调整记录不存在 / Adjustment not found");
  row.usage = (
    await c.query<DraftView["usage"][number]>(
      "select kind,model,usage,elapsed_ms,status,estimated_usd from reschedule_usage where request_id=$1 order by created_at",
      [id],
    )
  ).rows;
  return row;
}
export async function trial(
  c: PoolClient,
  id: string,
  userId: string,
  revision: number,
  intent: Intent,
  today: string,
) {
  const snapshot = await readSnapshot(c, intent.startsOn, intent.endsOn);
  validateIntent(intent, snapshot, today);
  const result = calculatePlan(snapshot, intent);
  const updated = await c.query(
    `update reschedule_requests set intent=$4,result=$5,snapshot_hash=$6,status=$7,updated_at=clock_timestamp()
    where id=$1 and user_id=$2 and revision=$3 and status<>'APPLIED'`,
    [
      id,
      userId,
      revision,
      JSON.stringify(intent),
      JSON.stringify(result),
      snapshot.hash,
      result.candidates.length ? "READY" : "DRAFT",
    ],
  );
  if (!updated.rowCount)
    throw new Error("草案已有新版本 / A newer draft exists");
}
async function applyCalendar(
  c: PoolClient,
  intent: Intent,
  day: string,
  matches: { student_id: string; school_id: string; time: string }[],
  students: { id: string; grade: string }[],
) {
  for (const schoolId of new Set(intent.changes.map((x) => x.schoolId))) {
    const changes = intent.changes.filter((x) => x.schoolId === schoolId);
    // Keep holidays and non-service days exactly as before.
    if (
      !matches.some(
        (m) =>
          m.school_id === schoolId &&
          changes.some((x) =>
            x.grades.includes(
              students.find((s) => s.id === m.student_id)?.grade ?? "",
            ),
          ),
      )
    )
      continue;
    const old = (
      await c.query(
        `select id,name,starts_on::text as start,ends_on::text as end,pickup_time::text as time,grade_times as groups,updated_at::text as version
      from school_calendar_exceptions where operating_term_id=current_operating_term() and school_id=$1 and $2::date between starts_on and ends_on for update`,
        [schoolId, day],
      )
    ).rows[0];
    const groups: { grades: string[]; time: string }[] = old?.groups ?? [];
    const overrides = new Map<string, string>();
    for (const group of groups)
      for (const grade of group.grades) overrides.set(grade, group.time);
    // A school-wide special time is retained for grades not mentioned in this request.
    if (old?.time)
      for (const grade of ["TK", "K", "1", "2", "3", "4", "5", "6", "7"])
        if (!overrides.has(grade)) overrides.set(grade, old.time.slice(0, 5));
    for (const change of changes)
      for (const grade of change.grades) overrides.set(grade, change.time);
    if (old) {
      await c.query("delete from school_calendar_exceptions where id=$1", [
        old.id,
      ]);
      if (old.start < day)
        await c.query(
          `insert into school_calendar_exceptions(school_id,name,starts_on,ends_on,pickup_time,grade_times) values($1,$2,$3,$4::date-1,$5,$6)`,
          [
            schoolId,
            old.name,
            old.start,
            day,
            old.time,
            JSON.stringify(old.groups),
          ],
        );
      if (old.end > day)
        await c.query(
          `insert into school_calendar_exceptions(school_id,name,starts_on,ends_on,pickup_time,grade_times) values($1,$2,$3::date+1,$4,$5,$6)`,
          [
            schoolId,
            old.name,
            day,
            old.end,
            old.time,
            JSON.stringify(old.groups),
          ],
        );
    }
    const f = new FormData();
    for (const [k, v] of Object.entries({
      schoolId,
      kind: "exception",
      name: "接送调整 / Schedule adjustment",
      startsOn: day,
      endsOn: day,
      exceptionType: "grades",
      gradeTimes: JSON.stringify(
        [...overrides].map(([grade, time]) => ({ grades: [grade], time })),
      ),
    }))
      f.set(k, v);
    await savePickupSetting(c, f);
  }
}
export async function saveTemporary(
  c: PoolClient,
  p: PlannedRoute,
  date: string,
  requestId: string,
  endsOn = date,
  weekdays = [new Date(`${date}T12:00:00Z`).getUTCDay() || 7],
) {
  const ids = new Map(p.stops.map((s) => [s.id, randomUUID()]));
  const stops = p.stops.map((s) => ({ ...s, id: ids.get(s.id)! }));
  const students = p.students.map((s) => ({
    ...s,
    pickupStopId: ids.get(s.pickupStopId)!,
    dropoffStopId: ids.get(s.dropoffStopId)!,
  }));
  const f = new FormData();
  // Save the whole batch as drafts, then validate/enable together; sequential enabled
  // saves would compare a replacement with the original roster it is replacing.
  for (const [k, v] of Object.entries({
    routeType: "TEMPORARY",
    startsOn: date,
    endsOn,
    driverId: p.driverId,
    vehicleId: p.vehicleId,
    stops: JSON.stringify(stops),
    students: JSON.stringify(students),
  }))
    f.set(k, v);
  for (const weekday of weekdays) f.append("weekdays", String(weekday));
  await saveFixedRoute(c, f);
  const id = (
    await c.query("select route_id from fixed_route_stops where id=$1", [
      stops[0].id,
    ])
  ).rows[0].route_id as string;
  await c.query(
    "update fixed_routes set enabled=true,updated_at=clock_timestamp() where id=$1",
    [id],
  );
  for (const sourceId of p.sourceIds)
    await c.query(
      "insert into reschedule_route_replacements(request_id,source_route_id,target_route_id) values($1,$2,$3)",
      [requestId, sourceId, id],
    );
  return { id, students, stops, driverId: p.driverId, vehicleId: p.vehicleId };
}
async function materializeReplacements(c: PoolClient, date: string, today: string, requestId: string) {
  const rows = (await c.query<{source_route_id:string;target_route_id:string}>('select source_route_id,target_route_id from reschedule_route_replacements where request_id=$1', [requestId])).rows;
  const sources = new Map<string,string[]>();
  for (const row of rows) sources.set(row.target_route_id, [...(sources.get(row.target_route_id)??[]), row.source_route_id]);
  await materializeRoutes(c,date,today,undefined,sources);
  if ((await c.query("select 1 from route_task_issues where service_date=$1 and route_id=any($2::uuid[]) limit 1", [date, [...sources.keys()]])).rowCount)
    throw new Error("临时线路同步仍有冲突，未保存 / Temporary route synchronization has conflicts; nothing saved");
}
export async function applyDraft(
  c: PoolClient,
  id: string,
  userId: string,
  revision: number,
  candidateIndex: number,
  today: string,
) {
  await lockRoutes(c);
  const row = (
    await c.query(
      `select * from reschedule_requests where id=$1 and user_id=$2 for update`,
      [id, userId],
    )
  ).rows[0];
  if (!row) throw new Error("调整记录不存在 / Adjustment not found");
  if (row.status === "APPLIED") {
    if (row.applied_candidate !== candidateIndex || row.revision !== revision)
      throw new Error("已应用其他版本 / Another version was applied");
    return;
  }
  if (row.status !== "READY" || row.revision !== revision)
    throw new Error("请重新试算 / Please run a new trial");
  const intent = row.intent as Intent;
  // Shared route lock serializes schedule/configuration operations; student locks
  // serialize driver execution before reading the commit snapshot.
  await c.query("select id from students order by id for update");
  await c.query("select id from drivers order by id for update");
  await c.query("select id from vehicles order by id for update");
  const snapshot = await readSnapshot(c, intent.startsOn, intent.endsOn);
  validateIntent(intent, snapshot, today);
  if (
    snapshot.term.id !== row.operating_term_id ||
    snapshot.hash !== row.snapshot_hash
  )
    throw new Error(
      "排班或执行状态已变化，请重新试算 / Schedule or execution changed; run a new trial",
    );
  const stored = row.result as PlanResult;
  const candidate = stored.candidates[candidateIndex];
  if (!candidate) throw new Error("方案不存在 / Candidate not found");
  // Re-run deterministic rules/search on current data; never trust a client-supplied plan.
  const fresh = calculatePlan(snapshot, intent);
  if (!fresh.candidates.some((c) => isDeepStrictEqual(c, candidate)))
    throw new Error("方案需重新校验，请重新试算 / Candidate needs a new trial");
  const carryDates = await retireTemporarySources(
    c,
    snapshot,
    candidate,
    id,
    today,
    saveTemporary,
  );
  for (const day of candidate.days) {
    const source = snapshot.days.find((d) => d.date === day.date)!;
    await applyCalendar(c, intent, day.date, source.matches, snapshot.students);
    const replacements = day.after.filter((p) =>
      p.sourceIds.some((id) => day.replaceIds.includes(id)),
    );
    // Recheck the enabled-route requirements that are deliberately skipped by a draft save.
    for (const p of replacements)
      for (const s of p.students)
        if (!snapshot.students.find((x) => x.id === s.studentId)?.reviewed)
          throw new Error(
            "请先核对本学期学生资料 / Review this term’s student details first",
          );
    const created = [];
    for (const p of replacements)
      created.push(await saveTemporary(c, p, day.date, id));
    // Release only unstarted source shifts. Keep trips live until the generator
    // moves their assignments, retaining assignment IDs and append-only history.
    await c.query(
      `update driver_shifts set status='CANCELED' where id in (select shift_id from trips where fixed_route_id=any($1::uuid[]) and scheduled_date=$2)`,
      [day.replaceIds, day.date],
    );
    await materializeReplacements(c, day.date, today, id);
    for (const p of created) {
      const actual = (
        await c.query(
          `select t.id,t.route_stops,sh.driver_id,sh.vehicle_id,
        (select coalesce(jsonb_agg(student_id::text order by student_id),'[]') from trip_students where trip_id=t.id) as students
        from trips t join driver_shifts sh on sh.id=t.shift_id where t.fixed_route_id=$1 and t.scheduled_date=$2 and t.status<>'CANCELED'`,
          [p.id, day.date],
        )
      ).rows[0];
      if (
        !actual ||
        JSON.stringify(actual.students) !==
          JSON.stringify(p.students.map((s) => s.studentId).sort()) ||
        !isDeepStrictEqual(actual.route_stops, p.stops) ||
        actual.driver_id !== p.driverId ||
        actual.vehicle_id !== p.vehicleId
      )
        throw new Error(
          "生成结果与草案不一致，未保存，请重新试算 / Generated result differs from draft; nothing saved",
        );
    }
    if (
      (
        await c.query(
          "select 1 from route_task_issues where service_date=$1 and route_id=any($2::uuid[])",
          [day.date, created.map((p) => p.id)],
        )
      ).rowCount
    )
      throw new Error(
        "调整仍有冲突，未保存 / Adjustment has conflicts; nothing saved",
      );
  }
  for (const date of carryDates)
    if (!candidate.days.some((d) => d.date === date))
      await materializeReplacements(c, date, today, id);
  await c.query(
    "update reschedule_requests set status='APPLIED',applied_candidate=$2,updated_at=clock_timestamp() where id=$1",
    [id, candidateIndex],
  );
}
