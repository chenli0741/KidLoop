import "server-only";

import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import type { Classroom, Driver, Program, Rider, School, Shift, Student, Trip, Vehicle } from "@/lib/types";

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
    id: string; name: string; address: string; pickup_map_url: string | null;
    pickup_instructions: string; dismissal_time: string | null;
  }>(`
    select id, name, address, pickup_map_url, pickup_instructions,
           dismissal_time::text
    from schools
    order by name
  `);
  return result.rows.map((row): School => ({
    id: row.id,
    name: row.name,
    address: row.address,
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

export async function getClassrooms() {
  await requireUser(["ADMIN"]);
  const result = await query<{
    id: string; school_id: string; school_name: string; name: string;
  }>(`
    select c.id, c.school_id, s.name as school_name, c.name
    from classrooms c
    join schools s on s.id = c.school_id
    order by s.name, c.name
  `);
  return result.rows.map((row): Classroom => ({
    id: row.id,
    schoolId: row.school_id,
    schoolName: row.school_name,
    name: row.name,
  }));
}

export async function getStudents() {
  await requireUser(["ADMIN"]);
  const result = await query<{
    id: string; name: string; photo_url: string; grade: string; age: number | null;
    classroom_name: string; classroom_id: string; school_id: string; school_name: string;
    program_id: string; program_name: string; parent_name: string; parent_phone: string; relationship: string;
    backup_phone: string; email: string; notes: string; updated_at: string;
  }>(`
    select st.id, st.name, st.photo_url, st.grade, st.age,
           c.name as classroom_name, c.id as classroom_id,
           sc.id as school_id, sc.name as school_name,
           p.id as program_id, p.name as program_name,
           coalesce(pa.name, '') as parent_name, coalesce(pa.phone, '') as parent_phone,
           coalesce(pa.relationship, '') as relationship,
           coalesce(pa.backup_phone, '') as backup_phone, coalesce(pa.email, '') as email,
           st.notes, st.updated_at::text
    from students st
    join classrooms c on c.id = st.classroom_id
    join schools sc on sc.id = c.school_id
    join after_school_programs p on p.id = st.program_id
    left join parents pa on pa.id = st.parent_id
    where st.active = true
    order by sc.name, c.name, st.name
  `);
  return result.rows.map((row): Student => ({
    id: row.id,
    name: row.name,
    photoUrl: row.photo_url,
    grade: row.grade,
    age: row.age,
    classroomName: row.classroom_name,
    classroomId: row.classroom_id,
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

export async function getTrips(date: string) {
  const user = await requireUser(["ADMIN", "DRIVER"]);
  const driverId = user.role === "DRIVER" ? user.driverId : null;
  const [tripResult, riderResult] = await Promise.all([
    query<{
      id: string; scheduled_date: string; departure_time: string; status: Trip["status"];
      driver_name: string; driver_phone: string; vehicle_name: string; vehicle_plate: string; capacity: number;
      school_name: string; school_address: string; pickup_map_url: string | null;
      pickup_instructions: string; dismissal_time: string | null; program_name: string;
      program_address: string; dropoff_info: string; program_requirements: string;
    }>(`
      select t.id, t.scheduled_date::text, t.departure_time::text, t.status,
             d.name as driver_name, d.phone as driver_phone,
             v.name as vehicle_name, v.plate as vehicle_plate, v.capacity,
             sc.name as school_name, sc.address as school_address,
             sc.pickup_map_url, sc.pickup_instructions, sc.dismissal_time::text,
             p.name as program_name, p.address as program_address,
             p.dropoff_info, p.requirements as program_requirements
      from trips t
      join driver_shifts sh on sh.id = t.shift_id
      join drivers d on d.id = sh.driver_id
      join vehicles v on v.id = sh.vehicle_id
      join schools sc on sc.id = t.school_id
      join after_school_programs p on p.id = t.program_id
      where t.scheduled_date = $1::date
        and ($2::uuid is null or (sh.driver_id = $2 and t.status <> 'DRAFT'))
      order by t.departure_time, d.name
    `, [date, driverId]),
    query<{
      trip_id: string; id: string; student_id: string; name: string; photo_url: string;
      classroom_name: string; grade: string; age: number | null; parent_name: string;
      parent_phone: string; status: Rider["status"]; parent_note: string; parent_absent: boolean;
    }>(`
      select ts.trip_id, ts.id, st.id as student_id, st.name, st.photo_url,
             c.name as classroom_name, st.grade, st.age,
             coalesce(pa.name, '') as parent_name, coalesce(pa.phone, '') as parent_phone, ts.status,
             coalesce(dp.note, '') as parent_note, coalesce(dp.absent, false) as parent_absent
      from trip_students ts
      join trips t on t.id = ts.trip_id
      join driver_shifts sh on sh.id = t.shift_id
      left join student_day_plans dp on dp.student_id = ts.student_id and dp.service_date = t.scheduled_date
      join students st on st.id = ts.student_id
      join classrooms c on c.id = st.classroom_id
      left join parents pa on pa.id = st.parent_id
      where t.scheduled_date = $1::date
        and ($2::uuid is null or (sh.driver_id = $2 and t.status <> 'DRAFT'))
      order by c.name, st.name
    `, [date, driverId]),
  ]);

  const ridersByTrip = new Map<string, Rider[]>();
  for (const row of riderResult.rows) {
    const riders = ridersByTrip.get(row.trip_id) ?? [];
    riders.push({
      id: row.id,
      studentId: row.student_id,
      name: row.name,
      photoUrl: row.photo_url,
      classroomName: row.classroom_name,
      grade: row.grade,
      age: row.age,
      parentName: row.parent_name,
      parentPhone: row.parent_phone,
      status: row.status,
      parentNote: row.parent_note,
      parentAbsent: row.parent_absent,
    });
    ridersByTrip.set(row.trip_id, riders);
  }

  return tripResult.rows.map((row): Trip => ({
    id: row.id,
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
  }));
}

export async function getDashboardCounts(date: string) {
  await requireUser(["ADMIN"]);
  const result = await query<{
    vehicles: string; drivers: string; students: string; active_trips: string; attention: string;
  }>(`
    select
      (select count(*) from vehicles where active = true) as vehicles,
      (select count(*) from drivers where active = true) as drivers,
      (select count(*) from students where active = true) as students,
      (select count(*) from trips where scheduled_date = $1::date and status not in ('COMPLETED', 'CANCELED')) as active_trips,
      (select count(*) from trips where scheduled_date = $1::date and status = 'NEEDS_ATTENTION') as attention
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
