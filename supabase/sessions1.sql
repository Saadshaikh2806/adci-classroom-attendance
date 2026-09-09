-- Run this once in the Supabase SQL editor to allow naming each lecture/test
-- (e.g. "Lecture 1 — Java Basics"). Titles are per class + batch + date, so the
-- same slot can be named differently on different days.

create table if not exists sessions1 (
  id              uuid primary key default gen_random_uuid(),
  class_name      text not null,
  batch_name      text not null,
  attendance_date date not null,
  session_type    text not null default 'Lecture',
  session_number  int  not null,
  title           text not null,
  created_at      timestamptz default now(),
  unique (class_name, batch_name, attendance_date, session_type, session_number)
);

alter table sessions1 enable row level security;

create policy "allow all - sessions1" on sessions1
  for all using (true) with check (true);
