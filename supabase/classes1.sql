-- Run this once in the Supabase SQL editor to add class/batch cards with a
-- numeric passcode. Existing students1 / attendance1 tables are untouched.

create table if not exists classes1 (
  id          uuid primary key default gen_random_uuid(),
  class_name  text not null,
  batch_name  text not null,
  code        text not null unique,
  color       text not null,
  created_at  timestamptz default now(),
  unique (class_name, batch_name)
);

alter table classes1 enable row level security;

create policy "allow all - classes1" on classes1
  for all using (true) with check (true);
