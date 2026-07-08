-- Run this once in the Supabase SQL editor to allow marking Tests alongside
-- Lectures. Existing attendance rows are treated as 'Lecture' by default.

alter table attendance1
  add column if not exists session_type text not null default 'Lecture';

-- Replace the old (student_id, lecture_number, attendance_date) unique
-- constraint with one that also includes session_type, so "Lecture 1" and
-- "Test 1" on the same day don't collide. Adjust the constraint name below
-- if your project generated a different one (check with \d attendance1 or
-- the Supabase table editor's "Indexes" tab).
alter table attendance1
  drop constraint if exists attendance1_student_id_lecture_number_attendance_date_key;

alter table attendance1
  add constraint attendance1_student_lecture_date_type_key
  unique (student_id, lecture_number, attendance_date, session_type);
