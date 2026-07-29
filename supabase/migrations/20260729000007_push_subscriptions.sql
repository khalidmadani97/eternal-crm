-- Slice 14 — web push subscriptions (DECISIONS 014). One row per browser
-- endpoint; a user can hold several (phone + desktop). Grants are explicit
-- per DECISIONS 020.

create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_push_subscriptions_user on public.push_subscriptions (user_id);

create trigger trg_push_subscriptions_updated_at
  before update on public.push_subscriptions
  for each row execute function public.set_updated_at();

alter table public.push_subscriptions enable row level security;

-- Users manage their own subscriptions; the send function reads all with
-- the service role.
create policy "own subscriptions" on public.push_subscriptions
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant select, insert, update, delete on public.push_subscriptions to service_role;
