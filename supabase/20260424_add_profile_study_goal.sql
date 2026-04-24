alter table public.profiles
  add column if not exists full_name text,
  add column if not exists study_goal text;
