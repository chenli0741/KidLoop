create table if not exists student_status_reasons (
  id text primary key,
  name_zh text not null,
  name_en text not null,
  roles text[] not null check (roles <@ array['ADMIN','DRIVER','PARENT']::text[] and cardinality(roles) > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into student_status_reasons (id, name_zh, name_en, roles) values
  ('ILLNESS', '因病缺席', 'Illness', array['ADMIN','DRIVER','PARENT']),
  ('PARENT_REQUEST', '家长请假', 'Parent request', array['ADMIN','PARENT']),
  ('PICKED_UP_ELSEWHERE', '由其他人接走', 'Picked up elsewhere', array['ADMIN','DRIVER','PARENT']),
  ('KEPT_AT_SCHOOL', '被老师留课', 'Kept at school', array['DRIVER','PARENT']),
  ('OTHER', '其他原因', 'Other reason', array['ADMIN','DRIVER','PARENT'])
on conflict (id) do nothing;

alter table status_history add column if not exists reason_id text references student_status_reasons(id);
create index if not exists student_status_reasons_active_idx on student_status_reasons(active);
