import type { PoolClient } from "pg";
import { validServiceDate } from "./day-plans";
import type { OperatingTerm } from "./operating-terms";

export type StudentServicePeriod = { id: string; startsOn: string; endsOn: string };

export function isStudentInService(
  student: { servicePeriods?: StudentServicePeriod[] },
  date: string,
) {
  // Undefined keeps pure fixtures and pre-migration callers backward compatible.
  if (student.servicePeriods === undefined) return true;
  return student.servicePeriods.some(period => period.startsOn <= date && period.endsOn >= date);
}

export class StudentServicePeriodError extends Error {}

function assertDate(value: string, term: OperatingTerm) {
  if (!validServiceDate(value) || value < term.startsOn || value > term.endsOn)
    throw new StudentServicePeriodError("date");
}

async function lockStudents(client: PoolClient, ids: string[], term: OperatingTerm) {
  const unique = [...new Set(ids)];
  if (!unique.length || unique.length > 500) throw new StudentServicePeriodError("students");
  const result = await client.query<{ id: string }>(`select s.id from students s
    join term_students ts on ts.tenant_id=s.tenant_id and ts.student_id=s.id and ts.operating_term_id=$2
    where s.active and s.id=any($1::uuid[]) order by s.id for update of s`, [unique, term.id]);
  if (result.rowCount !== unique.length) throw new StudentServicePeriodError("students");
  return unique;
}

async function invalidateFuture(client: PoolClient, term: OperatingTerm, from: string, today: string) {
  const first = from > today ? from : today;
  await client.query(`delete from schedule_materializations
    where operating_term_id=$1 and service_date between $2::date and $3::date`, [term.id, first, term.endsOn]);
}

export async function endStudentServices(client: PoolClient, term: OperatingTerm, studentIds: string[], lastServiceDate: string, today: string) {
  assertDate(lastServiceDate, term);
  const ids = await lockStudents(client, studentIds, term);
  for (const studentId of ids) {
    const current = await client.query<{ id: string; starts_on: string }>(`select id,starts_on::text from student_service_periods
      where operating_term_id=$1 and student_id=$2 and starts_on<=$3::date and ends_on>=$3::date
      order by starts_on desc limit 1 for update`, [term.id, studentId, lastServiceDate]);
    if (!current.rowCount) throw new StudentServicePeriodError("period");
    await client.query(`update student_service_periods set ends_on=$2::date,updated_at=clock_timestamp() where id=$1`, [current.rows[0].id, lastServiceDate]);
  }
  await invalidateFuture(client, term, lastServiceDate, today);
}

export async function addStudentServicePeriod(client: PoolClient, term: OperatingTerm, studentIds: string[], startsOn: string, endsOn: string, actorId: string, today: string) {
  assertDate(startsOn, term); assertDate(endsOn, term);
  if (startsOn > endsOn) throw new StudentServicePeriodError("date");
  const ids = await lockStudents(client, studentIds, term);
  for (const studentId of ids) {
    const overlap = await client.query(`select 1 from student_service_periods where operating_term_id=$1 and student_id=$2
      and starts_on<=$4::date and ends_on>=$3::date limit 1`, [term.id, studentId, startsOn, endsOn]);
    if (overlap.rowCount) throw new StudentServicePeriodError("overlap");
    await client.query(`insert into student_service_periods(operating_term_id,student_id,starts_on,ends_on,created_by)
      values($1,$2,$3,$4,$5)`, [term.id, studentId, startsOn, endsOn, actorId]);
  }
  await invalidateFuture(client, term, startsOn, today);
}
