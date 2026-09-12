-- Keep the original reference photo for on-device pickup matching.
-- A replacement photo invalidates the derived avatar until regenerated.
create table if not exists student_cartoon_avatars (
  student_id uuid primary key references students(id) on delete cascade,
  source_photo_url text not null,
  blob_url text not null,
  style_version text not null,
  created_at timestamptz not null default now()
);
