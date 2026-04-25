-- Intelligent session audio notes. Safe to run multiple times.

create table if not exists public.session_audio_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  audio_url text,
  audio_path text,
  duration_seconds integer not null default 0 check (duration_seconds between 0 and 90),
  transcription text,
  ai_summary text,
  manual_summary text,
  insights jsonb not null default '[]'::jsonb,
  detected_doubts jsonb not null default '[]'::jsonb,
  suggested_review jsonb not null default '{}'::jsonb,
  next_task text,
  status text not null default 'draft'
    check (status in ('draft', 'uploaded', 'processing', 'completed', 'failed')),
  source text not null default 'audio_ai',
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint session_audio_notes_insights_array check (jsonb_typeof(insights) = 'array'),
  constraint session_audio_notes_doubts_array check (jsonb_typeof(detected_doubts) = 'array'),
  constraint session_audio_notes_review_object check (jsonb_typeof(suggested_review) = 'object'),
  foreign key (user_id, session_id)
    references public.study_sessions(user_id, id)
    on delete cascade
);

create index if not exists idx_session_audio_notes_user_session
  on public.session_audio_notes (user_id, session_id, created_at desc);

drop trigger if exists trg_session_audio_notes_updated_at on public.session_audio_notes;
create trigger trg_session_audio_notes_updated_at
before update on public.session_audio_notes
for each row execute function public.set_updated_at();

alter table public.session_audio_notes enable row level security;

grant select, insert, update, delete
on public.session_audio_notes
to authenticated;

drop policy if exists "Users can manage own session audio notes" on public.session_audio_notes;
create policy "Users can manage own session audio notes"
on public.session_audio_notes
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('session-audios', 'session-audios', false, 6000000, array['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can read own session audios" on storage.objects;
create policy "Users can read own session audios"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'session-audios'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can upload own session audios" on storage.objects;
create policy "Users can upload own session audios"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'session-audios'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can update own session audios" on storage.objects;
create policy "Users can update own session audios"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'session-audios'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'session-audios'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can delete own session audios" on storage.objects;
create policy "Users can delete own session audios"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'session-audios'
  and (storage.foldername(name))[1] = auth.uid()::text
);
