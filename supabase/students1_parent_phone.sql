-- Run this once in the Supabase SQL editor to store a parent's WhatsApp number
-- against each student, used by the absentee notification flow.

alter table students1
  add column if not exists parent_phone text;
