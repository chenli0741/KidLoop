import 'server-only';
import type { PoolClient } from 'pg';
import { requireTerm } from './operating-terms';
import { readFixedRoutes, saveFixedRoute, materializeRoutes } from './fixed-routes';
import { studentRouteOptions } from './student-route-options';
import { PickupError } from './pickup-settings';

export type StudentRouteAssignment = { assigned: boolean; zh: string; en: string };

// Caller has just created the student and current-term membership in this transaction.
export async function assignNewStudentRoute(c: PoolClient, studentId: string, selectedKey: string, today: string): Promise<StudentRouteAssignment> {
  const term = await requireTerm(c);
  const student = (await c.query(`select s.school_id,s.program_id from students s
    join term_students ts on ts.student_id=s.id and ts.operating_term_id=$2
    where s.id=$1 and s.active and ts.reviewed for update of s`, [studentId, term.id])).rows[0];
  if (!student) throw new Error('New student is not in the working term');
  const routes = await readFixedRoutes(c);
  const candidates = studentRouteOptions(routes, today).filter(o => o.schoolId === student.school_id && o.programId === student.program_id);
  const chosen = selectedKey ? candidates.find(o => o.key === selectedKey) : candidates.length === 1 ? candidates[0] : undefined;
  if (!chosen) return {
    assigned: false,
    zh: selectedKey ? '学生已添加；所选线路已变化，待安排线路。' : '学生已添加，待安排线路。',
    en: selectedKey ? 'Student added. The selected route changed; route assignment pending.' : 'Student added; route assignment pending.',
  };
  const route = routes.find(r => r.id === chosen.routeId)!;
  await c.query('savepoint new_student_route');
  try {
    const form = new FormData();
    const riders = route.students.filter(s => s.studentId !== studentId);
    riders.push({ studentId, pickupStopId: chosen.pickupStopId, dropoffStopId: chosen.dropoffStopId });
    for (const [key, value] of Object.entries({
      id: route.id, updatedAt: route.updatedAt, routeType: route.routeType,
      startsOn: route.startsOn, endsOn: route.endsOn, driverId: route.driverId ?? '',
      vehicleId: route.vehicleId ?? '', enabled: 'on', stops: JSON.stringify(route.stops), students: JSON.stringify(riders),
    })) form.set(key, value);
    for (const day of route.weekdays) form.append('weekdays', String(day));
    await saveFixedRoute(c, form);
    const dates = new Set<string>([today, ...(await c.query<{date: string}>(
      'select scheduled_date::text as date from trips where fixed_route_id=$1 and scheduled_date>=$2', [route.id, today],
    )).rows.map(r => r.date)]);
    for (const date of dates) {
      await materializeRoutes(c, date, today, route.driverId!);
      const issue = (await c.query('select message from route_task_issues where route_id=$1 and service_date=$2', [route.id, date])).rows[0];
      if (issue) throw new PickupError(`线路任务存在冲突：${issue.message}`, `Route task conflict: ${issue.message}`);
    }
    await c.query('release savepoint new_student_route');
    return { assigned: true, zh: `学生已添加并加入「${route.name}」，应用于未开始及后续任务。`, en: `Student added to ${route.name} for unstarted and future trips.` };
  } catch (error) {
    await c.query('rollback to savepoint new_student_route');
    await c.query('release savepoint new_student_route');
    if (!(error instanceof PickupError)) throw error;
    return { assigned: false, zh: `学生已添加，待安排线路。${error.zh}`, en: `Student added; route assignment pending. ${error.en}` };
  }
}
