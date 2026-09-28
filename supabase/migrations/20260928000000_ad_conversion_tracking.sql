-- Slice 52 — Ad conversion tracking (Meta CAPI + Google Ads enhanced conversions)
-- Closes the attribution loop: when a lead from Meta/Google becomes a won job,
-- a server-side conversion event is sent back so the ad platform can optimise.

-- ── 1. Click IDs on inbound_leads ────────────────────────────────────────────
-- Captured from raw_payload or Google Sheets columns when present.
-- gclid: Google click ID (from URL ?gclid= param captured at form fill time)
-- fbclid: Facebook click ID (from URL ?fbclid= param — website traffic only)
-- For Meta lead gen forms the match is done by hashed email/phone instead.
alter table public.inbound_leads
  add column gclid  text,
  add column fbclid text;

-- ── 2. Ad credentials on business_settings ───────────────────────────────────
-- Per-business so multi-tenant clients can each configure their own ad accounts.
-- Tokens are read-only API keys — admin-only by the existing RLS policy.
alter table public.business_settings
  add column meta_pixel_id               text,
  add column meta_capi_token             text,
  add column google_ads_customer_id      text,
  add column google_ads_developer_token  text,
  add column google_ads_refresh_token    text,
  add column google_ads_oauth_client_id  text,
  add column google_ads_oauth_client_secret text,
  add column google_ads_conversion_action text;

-- ── 3. Conversion queue ───────────────────────────────────────────────────────
-- One row per won job. The edge function updates it in place (meta_sent,
-- google_sent). Rows are never deleted — they are the audit trail.
create table public.conversion_queue (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  business_id     uuid not null references public.businesses (id) on delete cascade,
  job_id          uuid not null references public.jobs (id) on delete cascade,
  lead_id         uuid references public.inbound_leads (id) on delete set null,

  meta_sent       boolean not null default false,
  meta_sent_at    timestamptz,
  meta_error      text,

  google_sent     boolean not null default false,
  google_sent_at  timestamptz,
  google_error    text
);

create index conversion_queue_business_idx on public.conversion_queue (business_id);
create index conversion_queue_job_idx      on public.conversion_queue (job_id);
-- Prevent duplicate queue rows for the same job
create unique index conversion_queue_job_unique on public.conversion_queue (job_id);

create trigger trg_conversion_queue_updated_at
  before update on public.conversion_queue
  for each row execute function public.set_updated_at();

alter table public.conversion_queue enable row level security;
create policy "staff select" on public.conversion_queue for select to authenticated using (
  business_id = any (public.my_business_ids())
);
create policy "service insert" on public.conversion_queue for insert to service_role with check (true);
create policy "service update" on public.conversion_queue for update to service_role using (true);

grant select on public.conversion_queue to authenticated;
grant select, insert, update on public.conversion_queue to service_role;

-- ── 4. Trigger: enqueue on won ────────────────────────────────────────────────
-- Fires after the log_stage_change trigger (which stamps won_at). Uses
-- on conflict do nothing so a stage bounce (won→fabrication→won) doesn't
-- re-fire; the queue row already exists with its history.
create or replace function public.enqueue_won_conversion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead_id uuid;
begin
  if new.stage = 'won' and (old.stage is null or old.stage <> 'won') then
    -- Find the most recent inbound_lead linked to this job, if any
    select id into v_lead_id
    from public.inbound_leads
    where job_id = new.id
    order by created_at desc
    limit 1;

    insert into public.conversion_queue (business_id, job_id, lead_id)
    values (new.business_id, new.id, v_lead_id)
    on conflict (job_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger trg_enqueue_won_conversion
  after update on public.jobs
  for each row execute function public.enqueue_won_conversion();
