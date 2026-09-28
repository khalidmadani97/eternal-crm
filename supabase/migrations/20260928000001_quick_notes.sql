-- Slice 53 — Quick notepad: per-user scratchpad Sara reads first.
-- Floating notepad in the shell: text notes + voice recordings with transcripts.
-- Sara reads quick_notes before everything else in her snapshot.
-- Notes live until the user clears them (not tasks, not activities).

create table public.quick_notes (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id     uuid references public.profiles (id) on delete set null,
  body        text not null,
  voice_path  text,   -- storage path in voice-notes bucket (if voice)
  kind        text not null default 'text' check (kind in ('text', 'voice'))
);

create index quick_notes_business_idx on public.quick_notes (business_id);
create index quick_notes_user_idx     on public.quick_notes (user_id);

create trigger trg_quick_notes_updated_at
  before update on public.quick_notes
  for each row execute function public.set_updated_at();

alter table public.quick_notes enable row level security;
-- Staff see their own notes + the whole business's notes (Sara reads all)
create policy "staff select" on public.quick_notes
  for select to authenticated
  using (business_id = any (public.my_business_ids()));

create policy "staff insert" on public.quick_notes
  for insert to authenticated
  with check (business_id = any (public.my_business_ids()));

create policy "owner delete" on public.quick_notes
  for delete to authenticated
  using (user_id = auth.uid() and business_id = any (public.my_business_ids()));

grant select, insert, delete on public.quick_notes to authenticated;
grant all on public.quick_notes to service_role;
