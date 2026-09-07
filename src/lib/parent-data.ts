import { ensureRouteTasks } from "./ensure-route-tasks";
import "server-only";
import { editableNote } from "@/lib/student-management";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import type { DayPlan, RiderStatus } from "@/lib/types";

export async function getParentChildren() {
  const user = await requireUser(["PARENT"]);
  const result = await query<{
    id: string; name: string; photoUrl: string; grade: string; age: number | null;
    schoolName: string; classroomName: string; programName: string; notes: string; updatedAt: string;
    parentName: string; relationship: string; parentPhone: string; backupPhone: string; email: string;
  }>(`
    select st.id, st.name, st.photo_url as "photoUrl", st.grade, st.age, st.notes,
      sc.name as "schoolName", c.name as "classroomName", p.name as "programName", st.updated_at::text as "updatedAt",
      coalesce(pa.name, '') as "parentName", coalesce(pa.relationship, '') as relationship,
      coalesce(pa.phone, '') as "parentPhone", coalesce(pa.backup_phone, '') as "backupPhone", coalesce(pa.email, '') as email
    from user_students us join students st on st.id = us.student_id
    join classrooms c on c.id = st.classroom_id join schools sc on sc.id = c.school_id
    join after_school_programs p on p.id = st.program_id
    left join parents pa on pa.id = st.parent_id
    where us.user_id = $1 and st.active order by st.name
  `, [user.id]);
  return result.rows.map((child) => ({ ...child, notes: editableNote(child.notes) }));
}

export async function getParentSchedule(date: string) {
  const user = await requireUser(["PARENT"]);
  await ensureRouteTasks(date);
  const [rides, plans] = await Promise.all([
    query<{
      id: string; studentId: string; date: string; departure: string; status: RiderStatus;
      schoolName: string; programName: string; driverName: string; driverPhone: string;
      vehicleName: string; vehiclePlate: string; pickedUpAt: string | null; droppedOffAt: string | null;
    }>(`
      select ts.id, ts.student_id as "studentId", t.scheduled_date::text as date,
        coalesce((select stop->>'time' from jsonb_array_elements(t.route_stops) stop where stop->>'id'=ts.pickup_stop_id::text),t.departure_time::text) as departure, ts.status,
        coalesce((select stop->>'name' from jsonb_array_elements(t.route_stops) stop where stop->>'id'=ts.pickup_stop_id::text),sc.name) as "schoolName", coalesce((select stop->>'name' from jsonb_array_elements(t.route_stops) stop where stop->>'id'=ts.dropoff_stop_id::text),p.name) as "programName", d.name as "driverName", d.phone as "driverPhone",
        v.name as "vehicleName", v.plate as "vehiclePlate",
        ts.picked_up_at::text as "pickedUpAt", ts.dropped_off_at::text as "droppedOffAt"
      from user_students us join trip_students ts on ts.student_id = us.student_id
      join trips t on t.id = ts.trip_id join driver_shifts sh on sh.id = t.shift_id
      join drivers d on d.id = sh.driver_id join vehicles v on v.id = sh.vehicle_id
      left join schools sc on sc.id = t.school_id left join after_school_programs p on p.id = t.program_id
      where us.user_id = $1 and t.scheduled_date = $2::date and t.status not in ('DRAFT', 'CANCELED')
      order by t.departure_time
    `, [user.id, date]),
    query<DayPlan>(`
      select dp.student_id as "studentId", dp.service_date::text as "serviceDate", dp.absent, dp.note, dp.updated_at::text as "updatedAt"
      from student_day_plans dp join user_students us on us.student_id = dp.student_id
      where us.user_id = $1 and dp.service_date = $2::date
    `, [user.id, date]),
  ]);
  return { rides: rides.rows, plans: plans.rows };
}

export async function getParentRequests(date: string) {
  const user = await requireUser(["ADMIN", "DRIVER"]);
  const result = await query<DayPlan & { studentName: string; parentName: string }>(`
    select dp.student_id as "studentId", dp.service_date::text as "serviceDate", dp.absent, dp.note,
      dp.updated_at::text as "updatedAt", st.name as "studentName", u.name as "parentName"
    from student_day_plans dp join students st on st.id = dp.student_id join app_users u on u.id = dp.updated_by
    where dp.service_date = $1::date and (dp.absent or dp.note <> '')
      and ($2::uuid is null or exists (
        select 1 from trip_students ts join trips t on t.id = ts.trip_id join driver_shifts sh on sh.id = t.shift_id
        where ts.student_id = dp.student_id and t.scheduled_date = dp.service_date
          and sh.driver_id = $2 and t.status not in ('DRAFT', 'CANCELED')
      )) order by dp.updated_at desc
  `, [date, user.role === "DRIVER" ? user.driverId : null]);
  return result.rows;
}
