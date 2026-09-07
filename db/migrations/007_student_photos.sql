create table student_photos (
  id uuid primary key,
  uploaded_by uuid not null references app_users(id),
  student_id uuid references students(id),
  blob_url text not null,
  created_at timestamptz not null default now()
);
create index student_photos_uploader_idx on student_photos(uploaded_by,created_at);
