-- Slice 19 — Meta Business Suite integration (DECISIONS 025).
--
-- Messenger and Instagram DMs thread into the same contact card as SMS.
-- Identity is a page-scoped user ID (PSID), not a phone number, so DMs get
-- their own table + an identity map instead of being forced into the
-- E.164-constrained messages table. Written only by the service role via
-- record_dm() — same discipline as record_message().

create type public.dm_platform as enum ('messenger', 'instagram');

-- Maps external chat identities to contacts. A contact may have several
-- (Messenger + Instagram); an identity belongs to exactly one contact.
create table public.channel_identities (
  id           uuid primary key default gen_random_uuid(),
  contact_id   uuid not null references public.contacts (id) on delete cascade,
  platform     public.dm_platform not null,
  external_id  text not null,             -- PSID / IGSID
  display_name text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (platform, external_id)
);

create index idx_channel_identities_contact on public.channel_identities (contact_id);

create trigger trg_channel_identities_updated_at
  before update on public.channel_identities
  for each row execute function public.set_updated_at();

create table public.dm_messages (
  id                  uuid primary key default gen_random_uuid(),
  activity_id         uuid not null unique references public.activities (id) on delete restrict,
  contact_id          uuid not null references public.contacts (id) on delete restrict,
  job_id              uuid references public.jobs (id) on delete set null,
  platform            public.dm_platform not null,
  external_id         text not null,      -- the counterparty PSID/IGSID
  direction           public.call_direction not null,
  body                text,
  provider_message_id text not null unique, -- Meta mid — idempotency key
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index idx_dm_messages_contact on public.dm_messages (contact_id);
create index idx_dm_messages_job     on public.dm_messages (job_id);

create trigger trg_dm_messages_updated_at
  before update on public.dm_messages
  for each row execute function public.set_updated_at();

-- Atomic + idempotent write path, mirroring record_message().
create function public.record_dm(
  p_provider_message_id text,
  p_platform            dm_platform,
  p_external_id         text,
  p_direction           call_direction,
  p_contact_id          uuid,
  p_job_id              uuid default null,
  p_body                text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dm_id       uuid;
  v_activity_id uuid;
begin
  select id into v_dm_id from dm_messages where provider_message_id = p_provider_message_id;
  if v_dm_id is not null then
    return v_dm_id; -- replayed webhook: one row, no changes
  end if;

  insert into activities (job_id, contact_id, kind, body)
  values (p_job_id, p_contact_id, 'dm', p_body)
  returning id into v_activity_id;

  begin
    insert into dm_messages (
      activity_id, contact_id, job_id, platform, external_id, direction,
      body, provider_message_id
    ) values (
      v_activity_id, p_contact_id, p_job_id, p_platform, p_external_id,
      p_direction, p_body, p_provider_message_id
    )
    returning id into v_dm_id;
  exception when unique_violation then
    select id into v_dm_id from dm_messages where provider_message_id = p_provider_message_id;
  end;
  return v_dm_id;
end;
$$;

revoke execute on function public.record_dm(text, dm_platform, text, call_direction, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.record_dm(text, dm_platform, text, call_direction, uuid, uuid, text) to service_role;

-- RLS + explicit grants (DECISIONS 020): staff read; identities are staff-
-- linkable (attach a chat to the right contact); dm rows service-role only.
alter table public.channel_identities enable row level security;
alter table public.dm_messages enable row level security;

create policy "staff select" on public.channel_identities for select to authenticated using (true);
create policy "staff insert" on public.channel_identities for insert to authenticated with check (true);
create policy "staff update" on public.channel_identities for update to authenticated using (true) with check (true);
create policy "staff delete" on public.channel_identities for delete to authenticated using (true);
create policy "staff select" on public.dm_messages for select to authenticated using (true);

grant select, insert, update, delete on public.channel_identities to authenticated;
grant select, insert, update, delete on public.channel_identities to service_role;
grant select on public.dm_messages to authenticated;
grant select, insert, update, delete on public.dm_messages to service_role;
