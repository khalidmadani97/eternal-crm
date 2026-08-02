-- Slice 39b — stage phases (which workspace a column lives in), custom
-- column seeds, and live lead-sheet ingestion (DECISIONS 033).

-- ── Stage phases ─────────────────────────────────────────────────────────────
alter table public.stage_settings
  add column phase text not null default 'pipeline' check (phase in ('pipeline', 'production'));

update public.stage_settings set phase = 'production'
  where stage in ('won', 'templated', 'fabrication', 'scheduled', 'installed', 'closed');
-- 'won' shows in both (handoff) — the boards treat won/lost specially; keep
-- phase=production and pipeline adds won/lost as terminals in the UI.

-- Seed hidden custom columns for every existing business.
insert into public.stage_settings (business_id, stage, label, position, hidden, phase)
select b.id, s.stage::public.job_stage, s.label, s.position, true, 'pipeline'
from public.businesses b,
     (values ('custom_1', 'Custom 1', 20), ('custom_2', 'Custom 2', 21),
             ('custom_3', 'Custom 3', 22), ('custom_4', 'Custom 4', 23),
             ('custom_5', 'Custom 5', 24), ('custom_6', 'Custom 6', 25)) as s(stage, label, position)
on conflict (business_id, stage) do nothing;

-- register_business(): seed customs + phases for new businesses.
create or replace function public.register_business(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business uuid;
begin
  if p_name is null or btrim(p_name) = '' then
    raise exception 'business name is required';
  end if;
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  insert into businesses (name, created_by) values (btrim(p_name), auth.uid())
  returning id into v_business;
  insert into business_members (business_id, user_id, role) values (v_business, auth.uid(), 'admin');
  update profiles set active_business_id = v_business where id = auth.uid();
  insert into business_settings (business_id, name) values (v_business, btrim(p_name));
  insert into stage_settings (business_id, stage, label, position, phase, hidden) values
    (v_business, 'new', 'New', 0, 'pipeline', false),
    (v_business, 'contacted', 'Contacted', 1, 'pipeline', false),
    (v_business, 'quoted', 'Quoted', 2, 'pipeline', false),
    (v_business, 'follow_up', 'Follow up', 3, 'pipeline', false),
    (v_business, 'won', 'Won', 4, 'production', false),
    (v_business, 'templated', 'Templated', 5, 'production', false),
    (v_business, 'fabrication', 'Fabrication', 6, 'production', false),
    (v_business, 'scheduled', 'Scheduled', 7, 'production', false),
    (v_business, 'installed', 'Installed', 8, 'production', false),
    (v_business, 'closed', 'Closed', 9, 'production', false),
    (v_business, 'lost', 'Lost', 10, 'pipeline', false),
    (v_business, 'custom_1', 'Custom 1', 20, 'pipeline', true),
    (v_business, 'custom_2', 'Custom 2', 21, 'pipeline', true),
    (v_business, 'custom_3', 'Custom 3', 22, 'pipeline', true),
    (v_business, 'custom_4', 'Custom 4', 23, 'pipeline', true),
    (v_business, 'custom_5', 'Custom 5', 24, 'pipeline', true),
    (v_business, 'custom_6', 'Custom 6', 25, 'pipeline', true);
  insert into option_items (business_id, list_key, value, position) values
    (v_business, 'lead_sources', 'referral', 0), (v_business, 'lead_sources', 'website', 1),
    (v_business, 'lead_sources', 'meta', 2), (v_business, 'lead_sources', 'google', 3),
    (v_business, 'lead_sources', 'repeat client', 4),
    (v_business, 'job_roles', 'Owner', 0), (v_business, 'job_roles', 'Sales', 1),
    (v_business, 'job_roles', 'Production Manager', 2), (v_business, 'job_roles', 'Installer', 3),
    (v_business, 'job_roles', 'Office Admin', 4);
  return v_business;
end;
$$;

-- ── Lead sheets (Meta/Google forms exported to Google Sheets) ────────────────
create table public.lead_sheets (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses (id) on delete cascade,
  name           text not null,
  provider       public.lead_provider not null default 'other',
  sheet_url      text not null,
  column_map     jsonb,            -- cached header→field mapping (AI or heuristic)
  last_synced_at timestamptz,
  last_error     text,
  rows_imported  int not null default 0,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index idx_lead_sheets_business on public.lead_sheets (business_id);
create trigger trg_lead_sheets_updated_at before update on public.lead_sheets
  for each row execute function public.set_updated_at();

alter table public.lead_sheets enable row level security;
create policy "staff select" on public.lead_sheets for select to authenticated using (true);
create policy "staff insert" on public.lead_sheets for insert to authenticated with check (true);
create policy "staff update" on public.lead_sheets for update to authenticated using (true) with check (true);
create policy "staff delete" on public.lead_sheets for delete to authenticated using (true);
create policy tenant_isolation on public.lead_sheets as restrictive for all to authenticated
  using (business_id = public.current_business())
  with check (business_id = public.current_business() or business_id is null);
create trigger trg_lead_sheets_fill_business before insert on public.lead_sheets
  for each row execute function public.fill_business_id();
alter table public.lead_sheets alter column business_id set default public.current_business();
grant select, insert, update, delete on public.lead_sheets to authenticated;
grant select, insert, update, delete on public.lead_sheets to service_role;

-- Row-level dedupe so re-syncing a sheet never duplicates a lead.
alter table public.inbound_leads add column dedupe_key text;
create unique index idx_inbound_leads_dedupe
  on public.inbound_leads (business_id, dedupe_key) where dedupe_key is not null;

-- Numbering usable by the sync function (service role, explicit business).
create or replace function public.next_document_number_for(p_business uuid, p_prefix text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year int := extract(year from now())::int;
  v_value int;
begin
  insert into document_counters (business_id, prefix, year, last_value)
  values (p_business, p_prefix, v_year, 1)
  on conflict (business_id, prefix, year)
  do update set last_value = document_counters.last_value + 1
  returning last_value into v_value;
  return format('%s-%s-%s', p_prefix, v_year, lpad(v_value::text, 4, '0'));
end;
$$;
revoke execute on function public.next_document_number_for(uuid, text) from public, anon, authenticated;
grant execute on function public.next_document_number_for(uuid, text) to service_role;
