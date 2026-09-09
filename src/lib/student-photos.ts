import "server-only";
import sharp from "sharp";
import type { PoolClient } from "pg";

export const photoPath = /^\/api\/photos\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
export async function normalizePhoto(bytes: Buffer) {
  if (!bytes.length || bytes.length > 1024 * 1024) throw new Error("photo");
  const image = sharp(bytes, {limitInputPixels: 20_000_000, animated: false});
  const metadata = await image.metadata();
  if (!metadata.format || !["jpeg","png","webp"].includes(metadata.format) || (metadata.pages ?? 1)>1) throw new Error("photo");
  return image.rotate().resize(1024,1024,{fit:"inside",withoutEnlargement:true}).jpeg({quality:82}).toBuffer();
}
export async function attachPhoto(c: PoolClient, url: string, studentId: string, actorId?: string) {
  const match = photoPath.exec(url);
  if (!match) return;
  const result = await c.query(`update student_photos set student_id=$2 where id=$1 and uploaded_by=$3 and purpose='student'
    and (student_id is null or student_id=$2) returning id`, [match[1],studentId,actorId ?? null]);
  if (!result.rowCount) throw new Error("photo");
}
export const photoAccessSql = `select p.blob_url,p.purpose from student_photos p
 left join students s on s.id=p.student_id
 where p.id=$1 and (
   $3='ADMIN' or (p.student_id is null and p.uploaded_by=$2) or
   (s.photo_url='/api/photos/'||p.id::text and (
     ($3='PARENT' and exists(select 1 from user_students u where u.student_id=s.id and u.user_id=$2)) or
     ($3='DRIVER' and (exists(select 1 from shared_pickup_members m join trip_students x on x.id=m.assignment_id join trips t on t.id=m.trip_id join driver_shifts sh on sh.id=t.shift_id where x.student_id=s.id and sh.driver_id=$4 and t.operating_term_id=current_operating_term() and t.status not in ('DRAFT','CANCELED')) or exists(select 1 from trip_students ts join trips t on t.id=ts.trip_id join driver_shifts sh on sh.id=t.shift_id where ts.student_id=s.id and sh.driver_id=$4 and t.status<>'CANCELED')))
   ))
 )`;
