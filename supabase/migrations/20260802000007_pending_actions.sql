-- Slice 46 — Sara's bulk changes are server-gated (DECISIONS 036): the AI
-- can only STAGE an action here. Executing requires the human to type the
-- confirmation phrase in the UI; every execution stores per-row undo state.

create table public.pending_actions (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses (id) on delete cascade,
  requested_by   uuid not null references public.profiles (id) on delete cascade,
  kind           text not null check (kind in ('move_leads', 'assign_leads')),
  summary        text not null,
  confirm_phrase text not null,
  patch          jsonb not null,      -- what to apply
  targets        jsonb not null,      -- [{id, prev:{...}}] — ids + undo state
  status         text not null default 'pending'
                 check (status in ('pending', 'executed', 'undone', 'cancelled', 'expired')),
  expires_at     timestamptz not null default now() + interval '15 minutes',
  executed_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index idx_pending_actions_business on public.pending_actions (business_id, status);
create trigger trg_pending_actions_updated_at before update on public.pending_actions
  for each row execute function public.set_updated_at();

alter table public.pending_actions enable row level security;
create policy "requester select" on public.pending_actions for select to authenticated
  using (requested_by = auth.uid());
grant select on public.pending_actions to authenticated;
grant select, insert, update, delete on public.pending_actions to service_role;
