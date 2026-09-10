import {
  activeOn,
  planRoute,
  overCapacity,
  overlaps,
  minutes,
  clockTime,
} from "../route-plan";
import type { FixedRoute, RouteStop } from "../fixed-route-types";
import type {
  Candidate,
  DayCandidate,
  Intent,
  PlannedRoute,
  PlanResult,
  Snapshot,
  Task,
} from "./types";
import { PICKUP_GRADES } from "../pickup-grades";

const dateValid = (s: unknown): s is string =>
  typeof s === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  Number.isFinite(Date.parse(s)) &&
  new Date(s).toISOString().slice(0, 10) === s;
export function validateIntent(
  value: unknown,
  snapshot: Snapshot,
  today: string,
): Intent {
  if (!value || typeof value !== "object")
    throw new Error("请补充调整条件 / Complete the adjustment details");
  const x = value as Intent;
  if (
    !dateValid(x.startsOn) ||
    !dateValid(x.endsOn) ||
    x.startsOn > x.endsOn ||
    x.startsOn < today ||
    x.startsOn < snapshot.term.startsOn ||
    x.endsOn > snapshot.term.endsOn ||
    Date.parse(x.endsOn) - Date.parse(x.startsOn) > 13 * 86400000
  )
    throw new Error(
      "请选择当前学期内今天起的日期，单次最多 14 天 / Choose up to 14 days from today within the current term",
    );
  if (
    !Array.isArray(x.changes) ||
    x.changes.length > 10 ||
    typeof x.preferExistingDrivers !== "boolean" ||
    typeof x.noAdditionalDrivers !== "boolean" ||
    typeof x.question !== "string"
  )
    throw new Error("调整条件无效 / Invalid adjustment");
  for (const [key, allowed] of [
    ["unavailableDriverIds", snapshot.drivers.map((d) => d.id)],
    ["unavailableVehicleIds", snapshot.vehicles.map((v) => v.id)],
    ["lockedRouteIds", snapshot.routes.map((r) => r.id)],
  ] as const) {
    if (
      !Array.isArray(x[key]) ||
      x[key].length > 100 ||
      x[key].some((id) => !allowed.includes(id))
    )
      throw new Error("资源或线路无法匹配 / Resource or route not found");
  }
  const changed = new Set<string>();
  for (const c of x.changes) {
    if (
      !c ||
      !snapshot.students.some((s) => s.schoolId === c.schoolId) ||
      !Array.isArray(c.grades) ||
      !c.grades.length ||
      c.grades.some((g) => !PICKUP_GRADES.includes(g)) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(c.time)
    )
      throw new Error("请核对学校、年级和时间 / Check school, grades and time");
    for (const g of c.grades) {
      const key = `${c.schoolId}:${g}`;
      if (changed.has(key))
        throw new Error("年级时间重复 / Duplicate grade time");
      changed.add(key);
    }
  }
  if (
    !x.changes.length &&
    !x.unavailableDriverIds.length &&
    !x.unavailableVehicleIds.length
  )
    throw new Error(
      "请说明要调整的时间或不可用资源 / Specify a time change or unavailable resource",
    );
  return x;
}
const interval = (p: PlannedRoute) => ({
  start: p.stops[0].time,
  end: p.stops.at(-1)!.time,
});
const samePlan = (a: PlannedRoute, b: PlannedRoute) =>
  JSON.stringify({ ...a, sourceIds: [...a.sourceIds].sort() }) ===
  JSON.stringify({ ...b, sourceIds: [...b.sourceIds].sort() });
const asPlan = (
  r: FixedRoute,
  matches: Snapshot["days"][number]["matches"],
  travelTimes: Snapshot["travelTimes"],
): PlannedRoute => ({
  sourceIds: [r.id],
  name: r.name,
  driverId: r.driverId!,
  vehicleId: r.vehicleId!,
  ...planRoute(r, matches, travelTimes),
});
const place = (s: RouteStop) =>
  s.schoolId
    ? `s:${s.schoolId}`
    : s.programId
      ? `p:${s.programId}`
      : `a:${s.address}`;

// Only use directed intervals already present in route templates, never model-generated travel estimates.
function merge(
  a: PlannedRoute,
  b: PlannedRoute,
  routes: FixedRoute[],
  matches: Snapshot["days"][number]["matches"],
  travelTimes: Snapshot["travelTimes"],
): PlannedRoute | null {
  const nodes = new Map<string, RouteStop>();
  for (const s of [...a.stops, ...b.stops])
    if (!nodes.has(place(s))) nodes.set(place(s), s);
  if (
    nodes.size > 6 ||
    a.students.some((s) => b.students.some((t) => t.studentId === s.studentId))
  )
    return null;
  const oldStops = [...a.stops, ...b.stops];
  const students = [...a.students, ...b.students].map((s) => ({
    ...s,
    pickupStopId: nodes.get(
      place(oldStops.find((p) => p.id === s.pickupStopId)!),
    )!.id,
    dropoffStopId: nodes.get(
      place(oldStops.find((p) => p.id === s.dropoffStopId)!),
    )!.id,
  }));
  const edges = new Map<string, number>();
  for (const r of routes)
    for (let i = 1; i < r.stops.length; i++) {
      const key = `${place(r.stops[i - 1])}>${place(r.stops[i])}`,
        duration = minutes(r.stops[i].time) - minutes(r.stops[i - 1].time);
      if (duration > 0) edges.set(key, Math.max(edges.get(key) ?? 0, duration));
    }
  let result: RouteStop[] | null = null;
  const walk = (path: RouteStop[]) => {
    if (result) return;
    if (path.length === nodes.size) {
      result = path;
      return;
    }
    for (const stop of nodes.values()) {
      if (path.some((p) => p.id === stop.id)) continue;
      if (
        students.some(
          (s) =>
            s.dropoffStopId === stop.id &&
            !path.some((p) => p.id === s.pickupStopId),
        )
      )
        continue;
      const previous = path.at(-1);
      let duration: number | undefined = 0;
      if (previous) {
        const configured = travelTimes.find(t => t.fromName === previous.name && t.toName === stop.name)?.minutes;
        const fallback = edges.get(`${place(previous)}>${place(stop)}`);
        duration = (configured ?? fallback) === undefined ? undefined : (configured ?? fallback)! + (previous.dwellMinutes ?? 0);
      }
      if (duration === undefined) continue;
      const releases = students
        .filter((s) => s.pickupStopId === stop.id)
        .map((s) => matches.find((m) => m.student_id === s.studentId)?.time)
        .filter((s): s is string => !!s)
        .map(minutes);
      const time = Math.max(
        previous ? minutes(previous.time) + duration : minutes(stop.time),
        ...releases,
      );
      if (time > 1439) continue;
      walk([...path, { ...stop, time: clockTime(time) }]);
    }
  };
  walk([]);
  return result
    ? {
        ...a,
        name: [...nodes.values()].map((s) => s.name).join(" → "),
        sourceIds: [...new Set([...a.sourceIds, ...b.sourceIds])],
        students,
        stops: result,
      }
    : null;
}

export function calculatePlan(snapshot: Snapshot, intent: Intent): PlanResult {
  const result: PlanResult = {
    candidates: [],
    conflicts: [],
    warnings: [
      "优先使用已配置的地点间行驶时间；未配置的相邻地点沿用线路模板间隔，均不代表实时路况 / Uses configured point-to-point travel times first; template intervals are used only when missing and do not represent live traffic.",
    ],
    examined: 0,
  };
  const deadline = Date.now() + 2500;
  const candidateDays: DayCandidate[][] = [[], [], []];
  for (const day of snapshot.days) {
    const changedMatches = day.matches.map((m) => {
      const student = snapshot.students.find((s) => s.id === m.student_id);
      const change = intent.changes.find(
        (c) =>
          c.schoolId === m.school_id &&
          student &&
          c.grades.includes(student.grade),
      );
      return change ? { ...m, time: change.time } : m;
    });
    const active = snapshot.routes.filter((r) => activeOn(r, day.date));
    const immutable = active.filter(
      (r) =>
        intent.lockedRouteIds.includes(r.id) ||
        day.tasks.some((t) => t.routeId === r.id && t.started),
    );
    const blockers: Task[] = day.tasks.filter((t) => !t.routeId || t.started);
    const occupiedStudents = new Set(
      blockers.flatMap((t) => t.students.map((s) => s.studentId)),
    );
    for (const r of immutable) {
      const before = asPlan(r, day.matches, snapshot.travelTimes),
        after = asPlan(r, changedMatches, snapshot.travelTimes);
      // A dismissal change still affects a protected student when another grade
      // keeps the shared stop at the same latest pickup time.
      const changesProtectedDismissal = before.students.some((student) => {
        const oldMatch = day.matches.find((m) => m.student_id === student.studentId);
        const newMatch = changedMatches.find((m) => m.student_id === student.studentId);
        return oldMatch && newMatch && minutes(oldMatch.time) !== minutes(newMatch.time);
      });
      if (
        changesProtectedDismissal ||
        !samePlan(before, after) ||
        intent.unavailableDriverIds.includes(r.driverId!) ||
        intent.unavailableVehicleIds.includes(r.vehicleId!)
      ) {
        result.conflicts.push(
          `${day.date} · ${r.name}：已执行或锁定线路不能改动 / Started or locked route cannot change`,
        );
        return result;
      }
      if (
        !day.tasks.some((t) => t.routeId === r.id && t.started) &&
        before.students.length
      ) {
        if (
          !snapshot.drivers.some(
            (d) => d.id === r.driverId && d.active && d.status === "AVAILABLE",
          ) ||
          !snapshot.vehicles.some(
            (v) =>
              v.id === r.vehicleId && v.active && v.status !== "MAINTENANCE",
          )
        ) {
          result.conflicts.push(`${day.date} · ${r.name}：锁定线路的人车不可用 / Locked route resources are unavailable`);
          return result;
        }
        blockers.push({
          routeId: r.id,
          tripId: "",
          ...interval(before),
          driverId: before.driverId,
          vehicleId: before.vehicleId,
          students: before.students,
          stops: before.stops,
          started: false,
        });
        before.students.forEach((s) => occupiedStudents.add(s.studentId));
      }
    }
    const matches = changedMatches.filter(
      (m) => !occupiedStudents.has(m.student_id),
    );
    const originals = active.filter((r) => !immutable.includes(r));
    const temporaryStudents = new Set(
      active
        .filter((r) => r.routeType === "TEMPORARY")
        .flatMap((r) => asPlan(r, matches, snapshot.travelTimes).students.map((s) => s.studentId)),
    );
    const routeMatches = (r: FixedRoute, list: typeof matches) =>
      list.filter(
        (m) =>
          !occupiedStudents.has(m.student_id) &&
          (r.routeType === "TEMPORARY" || !temporaryStudents.has(m.student_id)),
      );
    const before = originals
      .map((r) => asPlan(r, routeMatches(r, day.matches), snapshot.travelTimes))
      .filter((r) => r.students.length);
    const base = originals
      .map((r) => asPlan(r, routeMatches(r, matches), snapshot.travelTimes))
      .filter((r) => r.students.length);
    if (base.length > 30) {
      result.conflicts.push(
        "单日超过 30 条线路，超出本次试算范围 / More than 30 routes in one day",
      );
      return result;
    }
    const variants: PlannedRoute[][] = [base];
    const split: PlannedRoute[] = [];
    for (const p of base) {
      const groups = new Map<string, typeof p.students>();
      for (const s of p.students) {
        const key = `${s.pickupStopId}:${matches.find((m) => m.student_id === s.studentId)?.time}:${s.dropoffStopId}`;
        groups.set(key, [...(groups.get(key) ?? []), s]);
      }
      for (const students of groups.values()) {
        const source = originals.find((r) => r.id === p.sourceIds[0])!;
        const first = Math.min(
            ...students.map((s) =>
              source.stops.findIndex((t) => t.id === s.pickupStopId),
            ),
          ),
          last = Math.max(
            ...students.map((s) =>
              source.stops.findIndex((t) => t.id === s.dropoffStopId),
            ),
          );
        const stops = source.stops.slice(first, last + 1);
        split.push({
          ...p,
          ...planRoute({ ...source, students, stops }, matches, snapshot.travelTimes),
        });
      }
    }
    variants.push(split);
    // Try bounded pairwise combinations, including cross-school paths with known template edges.
    for (let i = 0; i < split.length && variants.length < 16; i++)
      for (let j = i + 1; j < split.length && variants.length < 16; j++) {
        const joined = merge(split[i], split[j], snapshot.routes, matches, snapshot.travelTimes);
        if (joined)
          variants.push([
            ...split.filter((_, k) => k !== i && k !== j),
            joined,
          ]);
      }
    const usedDrivers = new Set([
      ...before.map((r) => r.driverId),
      ...blockers.map((t) => t.driverId),
    ]);
    const drivers = snapshot.drivers.filter(
      (d) =>
        d.active &&
        d.status === "AVAILABLE" &&
        !intent.unavailableDriverIds.includes(d.id) &&
        (!intent.noAdditionalDrivers || usedDrivers.has(d.id)),
    );
    const vehicles = snapshot.vehicles.filter(
      (v) =>
        v.active &&
        v.status !== "MAINTENANCE" &&
        !intent.unavailableVehicleIds.includes(v.id),
    );
    const solutions: PlannedRoute[][] = [];
    for (const variant of variants) {
      if (Date.now() > deadline || result.examined > 20000) break;
      const ordered = [...variant].sort(
        (a, b) =>
          a.stops[0].time.localeCompare(b.stops[0].time) ||
          b.students.length - a.students.length,
      );
      const initialSolutions = solutions.length;
      const search = (assigned: PlannedRoute[]): void => {
        if (
          ++result.examined > 20000 ||
          Date.now() > deadline ||
          solutions.length - initialSolutions >= 3
        )
          return;
        if (assigned.length === ordered.length) {
          solutions.push(assigned);
          return;
        }
        const task = ordered[assigned.length];
        if (
          task.stops.length < 2 ||
          task.stops.some((s) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.time))
        )
          return;
        const ds = [...drivers].sort(
          (a, b) =>
            Number(b.id === task.driverId) - Number(a.id === task.driverId) ||
            (intent.preferExistingDrivers
              ? Number(usedDrivers.has(b.id)) - Number(usedDrivers.has(a.id))
              : 0),
        );
        const vs = [...vehicles].sort(
          (a, b) =>
            Number(b.id === task.vehicleId) - Number(a.id === task.vehicleId),
        );
        for (const d of ds)
          for (const v of vs) {
            if (overCapacity(task.stops, task.students, v.capacity!)) continue;
            if (
              [
                ...blockers,
                ...assigned.map((p) => ({ ...p, ...interval(p) })),
              ].some(
                (b) =>
                  (b.driverId === d.id || b.vehicleId === v.id) &&
                  overlaps(interval(task), b),
              )
            )
              continue;
            search([...assigned, { ...task, driverId: d.id, vehicleId: v.id }]);
            if (result.examined > 20000 || Date.now() > deadline) return;
          }
      };
      search([]);
    }
    if (!solutions.length) {
      result.conflicts.push(
        `${day.date}：当前搜索范围内未找到符合现有规则的方案，请检查人车及锁定条件 / No feasible plan found within search limits; check resources and locks`,
      );
      return result;
    }
    const dayResults = solutions.map((after) => {
      const replaceIds = before
        .filter((p) => !after.some((a) => samePlan(a, p)))
        .flatMap((p) => p.sourceIds);
      // If one group changes, replace every group of its source, including groups otherwise unchanged.
      return {
        date: day.date,
        before,
        after,
        replaceIds: [...new Set(replaceIds)],
      };
    });
    const score = (d: DayCandidate) => [
      intent.preferExistingDrivers
        ? new Set(
            d.after
              .filter((p) => !usedDrivers.has(p.driverId))
              .map((p) => p.driverId),
          ).size
        : 0,
      d.replaceIds.length,
      d.after.length,
    ];
    dayResults.sort((a, b) => {
      const x = score(a),
        y = score(b);
      return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
    });
    const distinct = [
      ...new Map(dayResults.map((d) => [JSON.stringify(d.after), d])).values(),
    ];
    const topology = (d: DayCandidate) =>
      JSON.stringify(
        d.after.map((p) => ({
          students: p.students.map((s) => s.studentId).sort(),
          stops: p.stops.map((s) => [place(s), s.time]),
        })),
      );
    const unique: DayCandidate[] = [];
    const seen = new Set<string>();
    for (const d of distinct)
      if (!seen.has(topology(d))) {
        seen.add(topology(d));
        unique.push(d);
      }
    for (const d of distinct) if (!unique.includes(d)) unique.push(d);
    const unchangedTasks: PlannedRoute[] = blockers
      .filter((b) => b.stops.length >= 2)
      .map((b) => ({
        sourceIds: [b.routeId ?? b.tripId],
        name:
          snapshot.routes.find((r) => r.id === b.routeId)?.name ??
          b.stops.map((s) => s.name).join(" → "),
        driverId: b.driverId,
        vehicleId: b.vehicleId,
        students: b.students,
        stops: b.stops,
      }));
    for (let i = 0; i < 3; i++) {
      const selected = unique[i] ?? unique[0];
      candidateDays[i].push({
        ...selected,
        before: [...selected.before, ...unchangedTasks],
        after: [...selected.after, ...unchangedTasks],
      });
    }
    if (
      unique[0].after.some((p) =>
        p.students.some((s) => {
          const m = matches.find((m) => m.student_id === s.studentId),
            stop = p.stops.find((t) => t.id === s.pickupStopId);
          return m && stop && minutes(stop.time) > minutes(m.time);
        }),
      )
    )
      result.warnings.push(
        `${day.date}：部分学生仍需等待同站较晚放学的学生，请比较分批方案 / Some riders still wait for later dismissal at the same stop; compare split plans.`,
      );
  }
  result.candidates = [
    ...new Map(
      candidateDays.map((days) => {
        const c: Candidate = {
          days,
          changedRoutes: days.reduce((n, d) => n + d.replaceIds.length, 0),
          changedStudents: days.reduce(
            (n, d) =>
              n +
              d.before
                .filter((p) =>
                  p.sourceIds.some((id) => d.replaceIds.includes(id)),
                )
                .reduce((sum, p) => sum + p.students.length, 0),
            0,
          ),
          additionalDrivers: new Set(
            days.flatMap((d) =>
              d.after
                .filter(
                  (p) =>
                    !d.before.some((b) => b.driverId === p.driverId) &&
                    !snapshot.days
                      .find((day) => day.date === d.date)
                      ?.tasks.some((task) => task.driverId === p.driverId),
                )
                .map((p) => p.driverId),
            ),
          ).size,
        };
        return [JSON.stringify(days), c];
      }),
    ).values(),
  ];
  return result;
}
