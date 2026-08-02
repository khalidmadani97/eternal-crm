-- Slice 44 — email invites: adding a person who hasn't signed up yet sends
-- them a link that completes signup INTO the right business with the right
-- role. Single-use tokens, 14-day expiry.

create table public.invites (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  email       text not null,
  role        public.user_role not null default 'staff',
  token       text not null unique,
  invited_by  uuid references public.profiles (id) on delete set null,
  expires_at  timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index idx_invites_business_email on public.invites (business_id, lower(email));
create trigger trg_invites_updated_at before update on public.invites
  for each row execute function public.set_updated_at();

alter table public.invites enable row level security;
-- Admins of the business see its invites; all writes go through the invite
-- edge function (service role).
create policy "business admin select" on public.invites for select to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1 from business_members m
      where m.business_id = invites.business_id
        and m.user_id = auth.uid() and m.role = 'admin' and m.status = 'active'
    )
  );
grant select on public.invites to authenticated;
grant select, insert, update, delete on public.invites to service_role;
