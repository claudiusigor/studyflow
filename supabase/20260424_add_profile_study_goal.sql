alter table public.profiles
  add column if not exists full_name text,
  add column if not exists study_goal text,
  add column if not exists active_view text not null default 'dashboard'
    check (active_view in ('dashboard', 'agenda', 'tasks', 'pomodoro', 'subjects', 'mood')),
  add column if not exists theme text not null default 'light'
    check (theme in ('light', 'dark')),
  add column if not exists sidebar_collapsed boolean not null default false,
  add column if not exists layout jsonb;
