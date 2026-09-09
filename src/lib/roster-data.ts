import 'server-only';
import type { PoolClient } from 'pg';
import type { RosterChild, DismissalRule, PickupBatch } from './automatic-roster';
export async function readRosterData(c:Pick<PoolClient,'query'>){
 const [children,rules,batches]=await Promise.all([
  c.query<RosterChild>(`select s.id,s.name,s.school_id as "schoolId",s.program_id as "programId",trim(s.grade) as grade,s.no_pickup_weekdays as "noPickupWeekdays",ts.reviewed from students s join term_students ts on ts.student_id=s.id and ts.operating_term_id=current_operating_term() where s.active order by s.id`),
  c.query<DismissalRule>(`select school_id as "schoolId",grades,weekdays,to_char(pickup_time,'HH24:MI') as "pickupTime" from school_pickup_rules where operating_term_id=current_operating_term() order by school_id,pickup_time,id`),
  c.query<PickupBatch>(`select id,school_id as "schoolId",to_char(pickup_time,'HH24:MI') as "pickupTime",weekday,shared,excluded_student_ids as "excludedStudentIds",updated_at::text as "updatedAt" from school_pickup_batches where operating_term_id=current_operating_term() order by id`)
 ]);
 return {children:children.rows,rules:rules.rows,batches:batches.rows};
}
