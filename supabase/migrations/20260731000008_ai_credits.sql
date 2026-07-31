-- Slice 30 — AI usage metering and monthly credits (DECISIONS 030).
-- Every model call is logged; each user gets monthly_prompts per calendar
-- month plus an admin-granted extra pool. Enforcement lives in the edge
-- functions (they check before calling the model); this is the ledger.

create table public.ai_usage (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  function_name     text not null,           -- 'daily-brief' | 'transcribe'
  model             text,
  prompt_tokens     int,
  completion_tokens int,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index idx_ai_usage_user_month on public.ai_usage (user_id, created_at);

create trigger trg_ai_usage_updated_at
  before update on public.ai_usage
  for each row execute function public.set_updated_at();

create table public.ai_allowances (
  user_id         uuid primary key references public.profiles (id) on delete cascade,
  monthly_prompts int not null default 60,
  extra_prompts   int not null default 0,   -- admin top-ups; add to this month's cap
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger trg_ai_allowances_updated_at
  before update on public.ai_allowances
  for each row execute function public.set_updated_at();

alter table public.ai_usage enable row level security;
alter table public.ai_allowances enable row level security;

-- Everyone sees usage and allowances (single-office transparency, and the
-- Settings page shows the whole team); writes are service-role (usage) and
-- admin (allowances).
create policy "staff select" on public.ai_usage for select to authenticated using (true);
create policy "staff select" on public.ai_allowances for select to authenticated using (true);
create policy "admin update" on public.ai_allowances
  for update to authenticated
  using (exists (select 1 from public.profiles me where me.id = auth.uid() and me.role = 'admin'))
  with check (true);
create policy "admin insert" on public.ai_allowances
  for insert to authenticated
  with check (exists (select 1 from public.profiles me where me.id = auth.uid() and me.role = 'admin'));

grant select on public.ai_usage to authenticated;
grant select, insert, update on public.ai_allowances to authenticated;
grant select, insert, update, delete on public.ai_usage to service_role;
grant select, insert, update, delete on public.ai_allowances to service_role;
