-- StudyFlow / COLISEU Supabase schema draft
-- Safe to review before applying to a real Supabase project.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  display_name text,
  study_goal text,
  exam_date date,
  active_view text not null default 'dashboard'
    check (active_view in ('dashboard', 'agenda', 'tasks', 'pomodoro', 'subjects', 'mood')),
  theme text not null default 'light'
    check (theme in ('light', 'dark')),
  sidebar_collapsed boolean not null default false,
  layout jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists full_name text,
  add column if not exists study_goal text,
  add column if not exists active_view text not null default 'dashboard'
    check (active_view in ('dashboard', 'agenda', 'tasks', 'pomodoro', 'subjects', 'mood')),
  add column if not exists theme text not null default 'light'
    check (theme in ('light', 'dark')),
  add column if not exists sidebar_collapsed boolean not null default false,
  add column if not exists layout jsonb;

create table if not exists public.official_catalogs (
  id text primary key,
  name text not null,
  source_url text,
  version_label text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.official_subjects (
  id text primary key,
  catalog_id text not null references public.official_catalogs(id) on delete restrict,
  sort_order integer not null,
  name text not null,
  short_label text not null,
  lucide_icon text not null default 'book-open',
  color_var text not null,
  bg text not null,
  gradient text not null,
  glow text not null,
  monthly_target_hours integer not null default 10 check (monthly_target_hours > 0),
  created_at timestamptz not null default now(),
  unique (catalog_id, sort_order),
  unique (catalog_id, name)
);

create table if not exists public.official_topics (
  id text primary key,
  subject_id text not null references public.official_subjects(id) on delete cascade,
  sort_order integer not null,
  code text not null,
  title text not null,
  created_at timestamptz not null default now(),
  unique (subject_id, sort_order),
  unique (subject_id, code),
  unique (subject_id, id)
);

create table if not exists public.user_topic_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  topic_id text not null references public.official_topics(id) on delete restrict,
  status text not null default 'not_started'
    check (status in ('not_started', 'studying', 'review', 'done')),
  progress numeric(5,2) check (progress >= 0 and progress <= 100),
  last_studied_at timestamptz,
  review_due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, topic_id)
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id text not null references public.official_subjects(id) on delete restrict,
  topic_id text references public.official_topics(id) on delete restrict,
  title text not null,
  done boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (subject_id, topic_id)
    references public.official_topics(subject_id, id)
    on delete restrict
);

create table if not exists public.schedule_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id text not null references public.official_subjects(id) on delete restrict,
  topic_id text references public.official_topics(id) on delete restrict,
  event_date date not null,
  recurrence text not null default 'once' check (recurrence in ('once', 'weekly')),
  day_of_week integer not null check (day_of_week between 0 and 6),
  start_time time not null default '08:00',
  duration_minutes integer not null default 90 check (duration_minutes >= 15),
  label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (subject_id, topic_id)
    references public.official_topics(subject_id, id)
    on delete restrict
);

create table if not exists public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id text references public.official_subjects(id) on delete restrict,
  topic_id text references public.official_topics(id) on delete restrict,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_minutes integer not null default 0 check (duration_minutes >= 0),
  type text not null default 'focus' check (type in ('focus', 'break')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  constraint sessions_topic_requires_subject check (topic_id is null or subject_id is not null),
  foreign key (subject_id, topic_id)
    references public.official_topics(subject_id, id)
    on delete restrict
);

create table if not exists public.session_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid,
  subject_id text references public.official_subjects(id) on delete restrict,
  topic_id text references public.official_topics(id) on delete restrict,
  subject_name text,
  content_name text,
  session_label text,
  audio_url text,
  summary text not null default '',
  insights jsonb not null default '[]'::jsonb,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint session_notes_insights_array check (jsonb_typeof(insights) = 'array'),
  constraint notes_topic_requires_subject check (topic_id is null or subject_id is not null),
  foreign key (user_id, session_id)
    references public.study_sessions(user_id, id)
    on delete cascade,
  foreign key (subject_id, topic_id)
    references public.official_topics(subject_id, id)
    on delete restrict
);

create table if not exists public.mood_entries (
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_date date not null,
  mood text not null check (mood in ('otimo', 'bem', 'focado', 'cansado', 'frustrado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, entry_date)
);

create table if not exists public.pomodoro_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  phase text not null default 'focus' check (phase in ('focus', 'break')),
  session_count integer not null default 0 check (session_count >= 0),
  focus_duration_minutes integer not null default 25 check (focus_duration_minutes > 0),
  break_duration_minutes integer not null default 10 check (break_duration_minutes > 0),
  long_break_duration_minutes integer not null default 15 check (long_break_duration_minutes > 0),
  long_break_after integer not null default 4 check (long_break_after > 0),
  active_subject_id text references public.official_subjects(id) on delete set null,
  active_topic_id text references public.official_topics(id) on delete set null,
  active_session_id uuid,
  started_at timestamptz,
  left_seconds integer check (left_seconds is null or left_seconds >= 0),
  total_seconds integer check (total_seconds is null or total_seconds >= 0),
  is_running boolean not null default false,
  last_tick_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pomo_topic_requires_subject check (active_topic_id is null or active_subject_id is not null),
  foreign key (user_id, active_session_id)
    references public.study_sessions(user_id, id),
  foreign key (active_subject_id, active_topic_id)
    references public.official_topics(subject_id, id)
    on delete set null
);

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_name text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint analytics_payload_object check (jsonb_typeof(payload) = 'object')
);

create index if not exists idx_official_subjects_catalog_sort
  on public.official_subjects (catalog_id, sort_order);

create index if not exists idx_official_topics_subject_sort
  on public.official_topics (subject_id, sort_order);

create index if not exists idx_user_topic_progress_user_status
  on public.user_topic_progress (user_id, status);

create index if not exists idx_tasks_user_done_created
  on public.tasks (user_id, done, created_at desc);

create index if not exists idx_schedule_user_date
  on public.schedule_events (user_id, event_date);

create index if not exists idx_schedule_user_recurrence_dow
  on public.schedule_events (user_id, recurrence, day_of_week);

create index if not exists idx_sessions_user_started
  on public.study_sessions (user_id, started_at desc);

create index if not exists idx_session_notes_user_updated
  on public.session_notes (user_id, updated_at desc);

create index if not exists idx_mood_entries_user_date
  on public.mood_entries (user_id, entry_date desc);

create index if not exists idx_analytics_events_user_created
  on public.analytics_events (user_id, created_at desc);

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists trg_user_topic_progress_updated_at on public.user_topic_progress;
create trigger trg_user_topic_progress_updated_at
before update on public.user_topic_progress
for each row execute function public.set_updated_at();

drop trigger if exists trg_tasks_updated_at on public.tasks;
create trigger trg_tasks_updated_at
before update on public.tasks
for each row execute function public.set_updated_at();

drop trigger if exists trg_schedule_events_updated_at on public.schedule_events;
create trigger trg_schedule_events_updated_at
before update on public.schedule_events
for each row execute function public.set_updated_at();

drop trigger if exists trg_study_sessions_updated_at on public.study_sessions;
create trigger trg_study_sessions_updated_at
before update on public.study_sessions
for each row execute function public.set_updated_at();

drop trigger if exists trg_session_notes_updated_at on public.session_notes;
create trigger trg_session_notes_updated_at
before update on public.session_notes
for each row execute function public.set_updated_at();

drop trigger if exists trg_mood_entries_updated_at on public.mood_entries;
create trigger trg_mood_entries_updated_at
before update on public.mood_entries
for each row execute function public.set_updated_at();

drop trigger if exists trg_pomodoro_states_updated_at on public.pomodoro_states;
create trigger trg_pomodoro_states_updated_at
before update on public.pomodoro_states
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.official_catalogs enable row level security;
alter table public.official_subjects enable row level security;
alter table public.official_topics enable row level security;
alter table public.user_topic_progress enable row level security;
alter table public.tasks enable row level security;
alter table public.schedule_events enable row level security;
alter table public.study_sessions enable row level security;
alter table public.session_notes enable row level security;
alter table public.mood_entries enable row level security;
alter table public.pomodoro_states enable row level security;
alter table public.analytics_events enable row level security;

drop policy if exists "Authenticated users can read official catalogs" on public.official_catalogs;
create policy "Authenticated users can read official catalogs"
on public.official_catalogs
for select
to authenticated
using (true);

drop policy if exists "Authenticated users can read official subjects" on public.official_subjects;
create policy "Authenticated users can read official subjects"
on public.official_subjects
for select
to authenticated
using (true);

drop policy if exists "Authenticated users can read official topics" on public.official_topics;
create policy "Authenticated users can read official topics"
on public.official_topics
for select
to authenticated
using (true);

drop policy if exists "Users can select own profile" on public.profiles;
create policy "Users can select own profile"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "Users can delete own profile" on public.profiles;
create policy "Users can delete own profile"
on public.profiles
for delete
to authenticated
using (auth.uid() = id);

drop policy if exists "Users can manage own topic progress" on public.user_topic_progress;
create policy "Users can manage own topic progress"
on public.user_topic_progress
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can manage own tasks" on public.tasks;
create policy "Users can manage own tasks"
on public.tasks
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can manage own schedule" on public.schedule_events;
create policy "Users can manage own schedule"
on public.schedule_events
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can manage own study sessions" on public.study_sessions;
create policy "Users can manage own study sessions"
on public.study_sessions
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can manage own session notes" on public.session_notes;
create policy "Users can manage own session notes"
on public.session_notes
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can manage own mood entries" on public.mood_entries;
create policy "Users can manage own mood entries"
on public.mood_entries
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can manage own pomodoro state" on public.pomodoro_states;
create policy "Users can manage own pomodoro state"
on public.pomodoro_states
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can manage own analytics events" on public.analytics_events;
create policy "Users can manage own analytics events"
on public.analytics_events
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

insert into public.official_catalogs (id, name, source_url, version_label, is_active)
values (
  'pmmg-cfsd-2025',
  'Edital PMMG CFSD 2025',
  'https://pmminas.com/wp-content/uploads/2024/05/EDITAL-VERTICALIZADO-CFSD-PMMG-2025-@pmminas-METODO-OBA-OTAVIO-SOUZA.pdf',
  'PMMG CFSD 2025',
  true
)
on conflict (id) do update set
  name = excluded.name,
  source_url = excluded.source_url,
  version_label = excluded.version_label,
  is_active = excluded.is_active;

insert into public.official_subjects
  (id, catalog_id, sort_order, name, short_label, lucide_icon, color_var, bg, gradient, glow, monthly_target_hours)
values
  ('s1', 'pmmg-cfsd-2025', 1, 'Língua Portuguesa', 'LP', 'book-open', '--amber-l', 'rgba(255,90,31,0.14)', 'linear-gradient(90deg,#ff5a1f,#ff8754)', 'rgba(255,90,31,0.32)', 20),
  ('s4', 'pmmg-cfsd-2025', 2, 'Literatura', 'Li', 'book-marked', '--violet-l', 'rgba(139,92,246,0.14)', 'linear-gradient(90deg,#8b5cf6,#a78bfa)', 'rgba(139,92,246,0.28)', 8),
  ('s5', 'pmmg-cfsd-2025', 3, 'Noções de Língua Inglesa', 'EN', 'languages', '--sky-l', 'rgba(14,165,233,0.13)', 'linear-gradient(90deg,#0ea5e9,#38bdf8)', 'rgba(14,165,233,0.28)', 8),
  ('s6', 'pmmg-cfsd-2025', 4, 'Noções de Direito e Direitos Humanos', 'DH', 'scale', '--emerald-l', 'rgba(16,185,129,0.13)', 'linear-gradient(90deg,#10b981,#34d399)', 'rgba(16,185,129,0.28)', 16),
  ('s3', 'pmmg-cfsd-2025', 5, 'Raciocínio Lógico-Matemático', 'RL', 'calculator', '--amber-l', 'rgba(245,158,11,0.15)', 'linear-gradient(90deg,#f59e0b,#fbbf24)', 'rgba(245,158,11,0.25)', 15)
on conflict (id) do update set
  catalog_id = excluded.catalog_id,
  sort_order = excluded.sort_order,
  name = excluded.name,
  short_label = excluded.short_label,
  lucide_icon = excluded.lucide_icon,
  color_var = excluded.color_var,
  bg = excluded.bg,
  gradient = excluded.gradient,
  glow = excluded.glow,
  monthly_target_hours = excluded.monthly_target_hours;

insert into public.official_topics (id, subject_id, sort_order, code, title)
values
  ('s1-topic-01', 's1', 1, '1.1', 'Adequação conceitual'),
  ('s1-topic-02', 's1', 2, '1.2', 'Pertinência, relevância e articulação dos argumentos'),
  ('s1-topic-03', 's1', 3, '1.3', 'Seleção vocabular'),
  ('s1-topic-04', 's1', 4, '1.4', 'Estudo de texto'),
  ('s1-topic-05', 's1', 5, '1.5', 'Tipologia textual e gêneros textuais'),
  ('s1-topic-06', 's1', 6, '1.6', 'Coesão e coerência'),
  ('s1-topic-07', 's1', 7, '1.7', 'Ortografia oficial'),
  ('s1-topic-08', 's1', 8, '1.8', 'Acentuação gráfica'),
  ('s1-topic-09', 's1', 9, '1.9', 'Emprego das classes de palavras'),
  ('s1-topic-10', 's1', 10, '1.10', 'Emprego do sinal indicativo de crase'),
  ('s1-topic-11', 's1', 11, '1.11', 'Sintaxe da oração e do período'),
  ('s1-topic-12', 's1', 12, '1.12', 'Concordância verbal e nominal'),
  ('s1-topic-13', 's1', 13, '1.13', 'Regência verbal e nominal'),
  ('s1-topic-14', 's1', 14, '1.14', 'Colocação pronominal'),
  ('s4-topic-01', 's4', 1, '2.1', 'Livro "Campo Geral" (João Guimarães Rosa)'),
  ('s4-topic-02', 's4', 2, '2.2', 'Livro "Vidas Secas" (Graciliano Ramos)'),
  ('s5-topic-01', 's5', 1, '3.1', 'Compreensão e interpretação de texto escrito em língua inglesa'),
  ('s5-topic-02', 's5', 2, '3.2', 'Itens gramaticais para a compreensão dos conteúdos semânticos'),
  ('s6-topic-01', 's6', 1, '4.1', 'CF: Título I; Direitos e Deveres Individuais e Coletivos; Nacionalidade; Direitos Políticos; Administração Pública; Militares dos Estados; Tribunais e Juízes Militares; Forças Armadas; Segurança Pública'),
  ('s6-topic-02', 's6', 2, '4.2', 'Lei n. 4.657/1942 - Lei de Introdução às Normas do Direito Brasileiro'),
  ('s6-topic-03', 's6', 3, '4.3', 'Declaração Universal dos Direitos'),
  ('s6-topic-04', 's6', 4, '4.4', 'Convenção Americana sobre Direitos Humanos'),
  ('s3-topic-01', 's3', 1, '5.1', 'Análise e interpretação de representações de figuras planas, mapas, gráficos, tabelas, séries estatísticas e plantas; utilização de escalas'),
  ('s3-topic-02', 's3', 2, '5.2', 'Conceitos e aplicações básicas de estatística: população, amostra, variáveis, medidas de tendência central, dispersão e porcentagem'),
  ('s3-topic-03', 's3', 3, '5.3', 'Estruturas e diagramas lógicos; lógica de argumentação; lógica sentencial; tabelas-verdade; equivalências e implicações; leis de Morgan; silogismos'),
  ('s3-topic-04', 's3', 4, '5.4', 'Métrica: áreas, volumes, estimativas e aplicações'),
  ('s3-topic-05', 's3', 5, '5.5', 'Modelagem de situações-problema por meio de equações do 1º e 2º graus e sistemas lineares'),
  ('s3-topic-06', 's3', 6, '5.6', 'Noções básicas de contagem, probabilidade e estatística'),
  ('s3-topic-07', 's3', 7, '5.7', 'Noções de função: análise gráfica; funções afim, quadrática, exponencial e logarítmica; aplicações'),
  ('s3-topic-08', 's3', 8, '5.8', 'Operações com conjuntos'),
  ('s3-topic-09', 's3', 9, '5.9', 'Sequências numéricas, progressão aritmética e progressão geométrica'),
  ('s3-topic-10', 's3', 10, '5.10', 'Variação de grandezas: razão e proporção com aplicações; regra de três simples e composta')
on conflict (id) do update set
  subject_id = excluded.subject_id,
  sort_order = excluded.sort_order,
  code = excluded.code,
  title = excluded.title;
