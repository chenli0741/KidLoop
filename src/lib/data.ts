import {readFixedRoutes} from './fixed-routes';
import { addSharedRiders } from './shared-pickups';
import { displayedStudentPhoto, recognitionStudentPhoto } from './photo-display';
import { todayInOperationsTimeZone } from "./date";
import { ensureRouteTasks } from "./ensure-route-tasks";
import type { RouteStop } from "./fixed-route-types";
import "server-only";

import { requireUser } from "@/lib/auth";
import { db, query } from "@/lib/db";
import type { Driver, Program, Rider, School, Shift, Student, Trip, Vehicle } from "@/lib/types";

export async function getVehicles() {
  await requireUser(["ADMIN"]);
  const result = await query<Vehicle>(`
    select id, name, plate, capacity, status, updated_at::text as "updatedAt"
    from vehicles
    where active = true
    order by name
  `);
  return result.rows;
}

export async function getDrivers() {
  await requireUser(["ADMIN"]);
  const result = await query<Driver>(`
    select id, name, phone, status, updated_at::text as "updatedAt"
    from drivers
    where active = true
    order by name
  `);
  return result.rows;
}

export async function getSchools() {
  await requireUser(["ADMIN"]);
  const result = await query<{
    id: string; name: string; full_name: string; short_name: string | null; updated_at: string; address: string; pickup_map_url: string | null;
    pickup_instructions: string; dismissal_time: string | null;
  }>(`
    select id, coalesce(short_name,name) as name, name as full_name, short_name, updated_at::text, address, pickup_map_url, pickup_instructions,
           dismissal_time::text
    from schools
    order by name
  `);
  return result.rows.map((row): School => ({
    id: row.id,
    name: row.name,
    address: row.address,
    fullName: row.full_name,
    shortName: row.short_name,
    updatedAt: row.updated_at,
    pickupMapUrl: row.pickup_map_url,
    pickupInstructions: row.pickup_instructions,
    dismissalTime: row.dismissal_time,
  }));
}

export async function getPrograms() {
  await requireUser(["ADMIN"]);
  const result = await query<{
    id: string; name: string; address: string; dropoff_info: string; requirements: string;
  }>(`
    select id, name, address, dropoff_info, requirements
    from after_school_programs
    order by name
  `);
  return result.rows.map((row): Program => ({
    id: row.id,
    name: row.name,
    address: row.address,
    dropoffInfo: row.dropoff_info,
    requirements: row.requirements,
  }));
}

export async function getStudents(knownRoutes?: ReturnType<typeof readFixedRoutes>) {
  const user = await requireUser(["ADMIN"]);
  const routesPromise = knownRoutes ?? readFixedRoutes(db);
  const [result, routes] = await Promise.all([query<{
    id: string; name: string; photo_url: string; cartoon_url: string; grade: string; age: number | null; route_assigned: boolean;
    no_pickup_weekdays: number[]; classroom_name: string; classroom_id: string; school_id: string; school_name: string;
    program_id: string; program_name: string; parent_name: string; parent_phone: string; relationship: string;
    backup_phone: string; email: string; notes: string; updated_at: string;
  }>(`
    select false as route_assigned,
           st.id, st.name, st.photo_url, (select '/api/student-avatars/'||ca.student_id::text from student_cartoon_avatars ca where ca.student_id=st.id and ca.source_photo_url=coalesce(st.photo_url,'')) as cartoon_url, st.grade, st.age, st.no_pickup_weekdays,
           st.classroom_name, st.classroom_id,
           sc.id as school_id, coalesce(sc.short_name,sc.name) as school_name,
           p.id as program_id, p.name as program_name,
           coalesce(pa.name, '') as parent_name, coalesce(pa.phone, '') as parent_phone,
           coalesce(pa.relationship, '') as relationship,
           coalesce(pa.backup_phone, '') as backup_phone, coalesce(pa.email, '') as email,
           st.notes, st.updated_at::text
    from students st
    join schools sc on sc.id = st.school_id
    join after_school_programs p on p.id = st.program_id
    left join parents pa on pa.id = st.parent_id
    where st.active = true and exists(select 1 from term_students ts where ts.student_id=st.id and ts.operating_term_id=current_operating_term())
    order by sc.name, st.classroom_name, st.name
  `), routesPromise]);
  const assigned=new Set(routes.filter(r=>r.enabled&&r.endsOn>=todayInOperationsTimeZone()).flatMap(r=>r.students.map(a=>a.studentId)));
  return result.rows.map((row): Student => ({
    id: row.id,
    name: row.name,
    photoUrl: displayedStudentPhoto(user, row.photo_url, row.cartoon_url),
    grade: row.grade,
    age: row.age,
    classroomName: row.classroom_name,
    noPickupWeekdays: row.no_pickup_weekdays,
    routeAssigned: assigned.has(row.id),
    schoolId: row.school_id,
    schoolName: row.school_name,
    programId: row.program_id,
    programName: row.program_name,
    parentName: row.parent_name,
    parentPhone: row.parent_phone,
    relationship: row.relationship,
    backupPhone: row.backup_phone,
    email: row.email,
    notes: row.notes,
    updatedAt: row.updated_at,
  }));
}

export async function getShifts(fromDate?: string) {
  await requireUser(["ADMIN"]);
  const result = await query<{
    id: string; shift_date: string; start_time: string; end_time: string; status: Shift["status"];
    driver_id: string; driver_name: string; vehicle_id: string; vehicle_name: string;
    vehicle_plate: string; capacity: number;
  }>(`
    select sh.id, sh.shift_date::text, sh.start_time::text, sh.end_time::text, sh.status,
           d.id as driver_id, d.name as driver_name,
           v.id as vehicle_id, v.name as vehicle_name, v.plate as vehicle_plate, v.capacity
    from driver_shifts sh
    join drivers d on d.id = sh.driver_id
    join vehicles v on v.id = sh.vehicle_id
    where ($1::date is null or sh.shift_date >= $1::date)
    order by sh.shift_date, sh.start_time, d.name
  `, [fromDate ?? null]);
  return result.rows.map((row): Shift => ({
    id: row.id,
    shiftDate: row.shift_date,
    startTime: row.start_time,
    endTime: row.end_time,
    status: row.status,
    driverId: row.driver_id,
    driverName: row.driver_name,
    vehicleId: row.vehicle_id,
    vehicleName: row.vehicle_name,
    vehiclePlate: row.vehicle_plate,
    capacity: row.capacity,
  }));
}

export async function getTrips(date: string, options?: { ensure?: boolean }) {
  const user = await requireUser(["ADMIN", "DRIVER"]);
  if(user.role === 'DRIVER' && !user.driverId) return [];
  if(options?.ensure !== false) {
    if(user.role === 'DRIVER') {
      const existing=await query('select 1 from trips t join driver_shifts sh on sh.id=t.shift_id where t.operating_term_id=current_operating_term() and t.scheduled_date=$1::date and t.status not in (\'DRAFT\',\'CANCELED\') and sh.driver_id=$2 limit 1',[date,user.driverId]);
      if(!existing.rowCount) await ensureRouteTasks(date,user.driverId!);
    } else await ensureRouteTasks(date);
  }
  const driverId = user.role === "DRIVER" ? user.driverId : null;
  const [tripResult, riderResult] = await Promise.all([
    query<{
      execution_version: string; completed_segments: string[]; current_stop_index:number; progress_state:"AT_STOP"|"IN_TRANSIT"; route_name: string | null; route_stops: RouteStop[] | null; id: string; scheduled_date: string; departure_time: string; status: Trip["status"];
      driver_name: string; driver_phone: string; vehicle_name: string; vehicle_plate: string; capacity: number;
      school_name: string; school_address: string; pickup_map_url: string | null;
      pickup_instructions: string; dismissal_time: string | null; program_name: string;
      program_address: string; dropoff_info: string; program_requirements: string;
    }>(`
      select to_char(t.updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US') as execution_version,
             t.current_stop_index,t.progress_state,
             array(select pickup_stop_id::text||':'||dropoff_stop_id::text from trip_segment_completions where trip_id=t.id) as completed_segments,
             t.route_name,t.route_stops,t.id, t.scheduled_date::text, t.departure_time::text, t.status,
             d.name as driver_name, d.phone as driver_phone,
             v.name as vehicle_name, v.plate as vehicle_plate, v.capacity,
             coalesce(sc.short_name,sc.name) as school_name, sc.address as school_address,
             sc.pickup_map_url, sc.pickup_instructions, sc.dismissal_time::text,
             p.name as program_name, p.address as program_address,
             p.dropoff_info, p.requirements as program_requirements
      from trips t
      join driver_shifts sh on sh.id = t.shift_id
      join drivers d on d.id = sh.driver_id
      join vehicles v on v.id = sh.vehicle_id
      left join schools sc on sc.id = t.school_id
      left join after_school_programs p on p.id = t.program_id
      where t.operating_term_id=current_operating_term() and t.scheduled_date = $1::date and t.status not in ('DRAFT','CANCELED')
        and ($2::uuid is null or (sh.driver_id = $2 and t.status <> 'DRAFT'))
      order by t.departure_time, d.name
    `, [date, driverId]),
    query<{
      missed_pickup_note: string | null; trip_id: string; id: string; student_id: string; name: string; photo_url: string; cartoon_url: string;
      classroom_name: string; grade: string; age: number | null; parent_name: string;
      parent_phone: string; status: Rider["status"]; parent_note: string; parent_absent: boolean; pickup_stop_id: string|null; dropoff_stop_id:string|null; school_name:string;
    }>(`
      select (select note from status_history where trip_student_id=ts.id and to_status='EXCEPTION' order by created_at desc limit 1) as missed_pickup_note,
             ts.pickup_stop_id,ts.dropoff_stop_id,(select coalesce(short_name,name) from schools where id=st.school_id) as school_name, ts.trip_id, ts.id, st.id as student_id, st.name, st.photo_url, (select '/api/student-avatars/'||ca.student_id::text from student_cartoon_avatars ca where ca.student_id=st.id and ca.source_photo_url=coalesce(st.photo_url,'')) as cartoon_url,
             st.classroom_name, st.grade, st.age,
             case when $2::uuid is null then coalesce(pa.name, '') else '' end as parent_name,
             case when $2::uuid is null then coalesce(pa.phone, '') else '' end as parent_phone, ts.status,
             coalesce(dp.note, '') as parent_note, coalesce(dp.absent, false) as parent_absent
      from trip_students ts
      join trips t on t.id = ts.trip_id
      join driver_shifts sh on sh.id = t.shift_id
      left join student_day_plans dp on dp.student_id = ts.student_id and dp.service_date = t.scheduled_date
      join students st on st.id = ts.student_id
      left join parents pa on pa.id = st.parent_id
      where t.operating_term_id=current_operating_term() and t.scheduled_date = $1::date and t.status not in ('DRAFT','CANCELED')
        and ($2::uuid is null or (sh.driver_id = $2 and t.status <> 'DRAFT'))
      order by st.classroom_name, st.name
    `, [date, driverId]),
  ]);

  const ridersByTrip = new Map<string, Rider[]>();
  for (const row of riderResult.rows) {
    const riders = ridersByTrip.get(row.trip_id) ?? [];
    riders.push({
      id: row.id,
      studentId: row.student_id,
      name: row.name,
      photoUrl: displayedStudentPhoto(user, row.photo_url, row.cartoon_url),
      recognitionPhotoUrl: recognitionStudentPhoto(user, row.photo_url),
      classroomName: row.classroom_name,
      grade: row.grade,
      age: row.age,
      parentName: row.parent_name,
      parentPhone: row.parent_phone,
      status: row.status,
      parentNote: row.parent_note,
      missedPickupNote: row.missed_pickup_note ?? undefined,
      parentAbsent: row.parent_absent,
      pickupStopId: row.pickup_stop_id, dropoffStopId:row.dropoff_stop_id, schoolName:row.school_name,
    });
    ridersByTrip.set(row.trip_id, riders);
  }

  return addSharedRiders(db, tripResult.rows.map((row): Trip => ({
    id: row.id,
    executionVersion: row.execution_version,
    currentStopIndex: row.current_stop_index,
    progressState: row.progress_state,
    routeName: row.route_name, routeStops:row.route_stops, completedSegments:row.completed_segments,
    scheduledDate: row.scheduled_date,
    departureTime: row.departure_time,
    status: row.status,
    driverName: row.driver_name,
    driverPhone: row.driver_phone,
    vehicleName: row.vehicle_name,
    vehiclePlate: row.vehicle_plate,
    capacity: row.capacity,
    schoolName: row.school_name,
    schoolAddress: row.school_address,
    pickupMapUrl: row.pickup_map_url,
    pickupInstructions: row.pickup_instructions,
    dismissalTime: row.dismissal_time,
    programName: row.program_name,
    programAddress: row.program_address,
    dropoffInfo: row.dropoff_info,
    programRequirements: row.program_requirements,
    riders: ridersByTrip.get(row.id) ?? [],
  })), user);
}

export async function getDashboardCounts(date: string, options?: { ensure?: boolean }) {
  await requireUser(["ADMIN"]);
  if(options?.ensure !== false) await ensureRouteTasks(date);
  const result = await query<{
    vehicles: string; drivers: string; students: string; active_trips: string; attention: string;
  }>(`
    with daily_trips as (
      select t.id,t.shift_id,t.status from trips t
      where t.operating_term_id=current_operating_term() and t.scheduled_date=$1::date and t.status not in ('DRAFT','CANCELED')
    )
    select
      (select count(distinct sh.vehicle_id) from daily_trips t join driver_shifts sh on sh.id=t.shift_id) as vehicles,
      (select count(distinct sh.driver_id) from daily_trips t join driver_shifts sh on sh.id=t.shift_id) as drivers,
      (select count(distinct ts.student_id) from trip_students ts join daily_trips t on t.id=ts.trip_id) as students,
      (select count(*) from daily_trips where status<>'COMPLETED') as active_trips,
      (select count(*) from daily_trips where status='NEEDS_ATTENTION') as attention
  `, [date]);
  const row = result.rows[0];
  return {
    vehicles: Number(row.vehicles),
    drivers: Number(row.drivers),
    students: Number(row.students),
    activeTrips: Number(row.active_trips),
    attention: Number(row.attention),
  };
}
