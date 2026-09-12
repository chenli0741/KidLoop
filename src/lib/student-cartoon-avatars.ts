import 'server-only';

// Match the reference-photo relationship checks. A changed source invalidates its avatar.
export const cartoonAvatarAccessSql = `select ca.blob_url, ca.created_at::text as version
 from student_cartoon_avatars ca join students s on s.id=ca.student_id
 where s.id=$1 and ca.source_photo_url=coalesce(s.photo_url,'') and (
   $3='ADMIN' or
   ($3='PARENT' and exists(select 1 from user_students u where u.student_id=s.id and u.user_id=$2)) or
   ($3='DRIVER' and (
     exists(select 1 from shared_pickup_members m join trip_students x on x.id=m.assignment_id
       join trips t on t.id=m.trip_id join driver_shifts sh on sh.id=t.shift_id
       where x.student_id=s.id and sh.driver_id=$4 and t.operating_term_id=current_operating_term()
         and t.status not in ('DRAFT','CANCELED')) or
     exists(select 1 from trip_students ts join trips t on t.id=ts.trip_id
       join driver_shifts sh on sh.id=t.shift_id where ts.student_id=s.id and sh.driver_id=$4 and t.status<>'CANCELED')
   ))
 )`;
