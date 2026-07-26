-- ============================================================================
-- Slice 0 — complete schema for Eternal CRM
--
-- Source of truth: docs/SCHEMA.md. Forward-only: a modelling error found later
-- is a new migration plus a DECISIONS entry, never an edit to this file.
--
-- Section order:
--   1.  Enums
--   2.  Utility functions (set_updated_at, block_mutation)
--   3.  Gapless document numbering (document_counters, next_document_number)
--   4.  Tables + FK indexes, in dependency order
--   5.  updated_at triggers
--   6.  Delete-policy and append-only guard triggers
--   7.  Stage-change trigger (activity row + won_at / lost_at stamps)
--   8.  SMS consent trigger
--   9.  Comms write path: record_call(), record_message()
--   10. delete_file()
--   11. Storage buckets
--   12. Row Level Security and privilege grants
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. ENUMS
-- Postgres enums, never free text. Adding a value is a migration.
-- ----------------------------------------------------------------------------

create type company_type    as enum ('builder','designer','general_contractor','supplier','other');
create type job_stage       as enum ('new','contacted','quoted','follow_up','won',
                                     'templated','fabrication','scheduled','installed',
                                     'closed','lost');
create type quote_status    as enum ('draft','sent','accepted','declined','expired');
create type invoice_status  as enum ('draft','sent','partial','paid','void');
create type payment_kind    as enum ('deposit','progress','final','refund');
create type payment_method  as enum ('etransfer','cheque','cash','card','other');
create type activity_kind   as enum ('note','call','sms','email','meeting','stage_change','system');
create type appt_kind       as enum ('consultation','template','install','service','pickup');
create type contract_status as enum ('draft','sent','signed','declined','void');
create type file_kind       as enum ('measure','drawing','slab_photo','site_photo',
                                     'contract','invoice','other');
create type user_role       as enum ('admin','staff');
create type call_direction  as enum ('inbound','outbound');
create type call_outcome    as enum ('connected','no_answer','voicemail','busy','failed');
create type message_status  as enum ('queued','sent','delivered','failed','received');
create type consent_channel as enum ('sms','call_recording');
create type consent_status  as enum ('express','implied','withdrawn');
create type lead_provider   as enum ('website','meta','google_ads','google_lsa',
                                     'zapier','manual','other');


-- ----------------------------------------------------------------------------
-- 2. UTILITY FUNCTIONS
-- ----------------------------------------------------------------------------

create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- One shared guard for everything the delete-policy matrix forbids
-- (docs/SCHEMA.md → "RLS and delete policy"). Attached per table in section 6.
-- A trigger rather than RLS so it also stops the service role and the
-- dashboard, not just clients.
create function public.block_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception '% on % is not allowed', tg_op, tg_table_name
    using hint = 'See the delete policy matrix in docs/SCHEMA.md.';
end;
$$;


-- ----------------------------------------------------------------------------
-- 3. GAPLESS DOCUMENT NUMBERING
-- Not a Postgres sequence: sequences do not roll back, so a failed insert
-- would burn a number, and invoice numbers must be gapless (DECISIONS 010).
-- ----------------------------------------------------------------------------

create table public.document_counters (
  prefix     text not null,
  year       int  not null,
  last_value int  not null default 0,
  primary key (prefix, year)
);

-- RLS on, no policies: clients can never see or touch this table. It is
-- accessed only inside next_document_number(), which is security definer.
alter table public.document_counters enable row level security;

create function public.next_document_number(p_prefix text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year int := extract(year from now())::int;
  v_next int;
begin
  -- The ON CONFLICT UPDATE takes a row lock, so concurrent callers for the
  -- same prefix serialise and numbers come out consecutive. If the calling
  -- transaction rolls back, the increment rolls back with it — gapless.
  insert into document_counters (prefix, year, last_value)
  values (p_prefix, v_year, 1)
  on conflict (prefix, year)
  do update set last_value = document_counters.last_value + 1
  returning last_value into v_next;

  return format('%s-%s-%s', p_prefix, v_year, lpad(v_next::text, 4, '0'));
end;
$$;


-- ----------------------------------------------------------------------------
-- 4. TABLES
-- Every table: id uuid PK, created_at, updated_at. Every FK: explicit
-- on delete rule and an index. Money is numeric(12,2); tax rates numeric(5,4).
-- Phone columns are E.164, CHECK-enforced — inbound comms webhooks match
-- contacts by exact number, so dirty phone data breaks threading.
-- The one deliberate CHECK exemption is inbound_leads.parsed_phone (DECISIONS 015).
-- ----------------------------------------------------------------------------

-- profiles ── mirrors auth.users. The signup trigger that populates it is
-- Slice 1; the table exists now so FKs can point at it.
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text,
  role       user_role not null default 'staff',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- companies ── trade accounts and referral sources; the referral-tracking
-- backbone. Soft delete only.
create table public.companies (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  type       company_type not null,
  phone      text,
  email      text,
  address    text,
  notes      text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint companies_phone_e164 check (phone is null or phone ~ '^\+[1-9]\d{1,14}$')
);

-- contacts ── the person; may or may not belong to a company.
create table public.contacts (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid references public.companies (id) on delete set null,
  full_name    text not null,
  phone        text,
  email        text,
  address      text,                                    -- billing/home; often ≠ job site
  lead_source  text,                                    -- how this *person* first arrived
  auto_created boolean not null default false,          -- true when an inbound comms webhook created it; lists filter these out until a human verifies
  notes        text,
  deleted_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint contacts_phone_e164 check (phone is null or phone ~ '^\+[1-9]\d{1,14}$')
);

create index contacts_company_id_idx on public.contacts (company_id);
-- Not a FK, but the inbound webhook lookup path — must be indexed. Not unique:
-- two contacts legitimately share a number (spouses).
create index contacts_phone_idx on public.contacts (phone);

-- jobs ── the spine. Everything hangs off a job.
create table public.jobs (
  id           uuid primary key default gen_random_uuid(),
  contact_id   uuid not null references public.contacts (id) on delete restrict,
  company_id   uuid references public.companies (id) on delete set null,  -- who referred this job
  job_number   text unique not null,                    -- from next_document_number('EI')
  title        text not null,
  site_address text,                                    -- where the work happens
  stage        job_stage not null default 'new',
  value_est    numeric(12,2),
  value_final  numeric(12,2),
  lead_source  text,  -- attribution for *this job*; deliberately separate from contacts.lead_source (see docs/SCHEMA.md)
  assigned_to  uuid references public.profiles (id) on delete set null,
  won_at       timestamptz,                             -- stamped by log_stage_change(); app code never writes it
  lost_at      timestamptz,                             -- stamped by log_stage_change(); app code never writes it
  lost_reason  text,                                    -- required when stage = lost; enforced in app (a trigger cannot prompt)
  deleted_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index jobs_contact_id_idx  on public.jobs (contact_id);
create index jobs_company_id_idx  on public.jobs (company_id);
create index jobs_assigned_to_idx on public.jobs (assigned_to);

-- activities ── append-only timeline. job_id is nullable so job-less comms
-- (an inbound text from a contact with no open job) still log; the check
-- keeps every activity attached to at least a job or a contact.
create table public.activities (
  id         uuid primary key default gen_random_uuid(),
  job_id     uuid references public.jobs (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  kind       activity_kind not null,
  body       text,
  meta       jsonb,                                     -- e.g. {"from":"quoted","to":"won"}
  user_id    uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint activities_has_subject check (job_id is not null or contact_id is not null)
);

create index activities_job_id_idx     on public.activities (job_id);
create index activities_contact_id_idx on public.activities (contact_id);
create index activities_user_id_idx    on public.activities (user_id);

-- appointments ── a job has many scheduled events (DECISIONS 004).
create table public.appointments (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null references public.jobs (id) on delete cascade,
  kind        appt_kind not null,
  starts_at   timestamptz not null,
  ends_at     timestamptz,
  assigned_to uuid references public.profiles (id) on delete set null,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index appointments_job_id_idx      on public.appointments (job_id);
create index appointments_assigned_to_idx on public.appointments (assigned_to);

-- quotes ── separate from invoices on purpose (DECISIONS 003).
create table public.quotes (
  id              uuid primary key default gen_random_uuid(),
  job_id          uuid not null references public.jobs (id) on delete cascade,
  quote_number    text unique not null,                 -- from next_document_number('Q')
  status          quote_status not null default 'draft',
  subtotal        numeric(12,2),
  tax_rate        numeric(5,4),
  tax_amount      numeric(12,2),
  total           numeric(12,2),
  valid_until     date,
  design_quote_id uuid,  -- external reference, deliberately no FK — see COMMENT below (DECISIONS 017)
  sent_at         timestamptz,
  accepted_at     timestamptz,
  body_snapshot   jsonb,                                -- terms + totals exactly as sent
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index quotes_job_id_idx on public.quotes (job_id);

comment on column public.quotes.design_quote_id is
  'External reference to the /design quoting tool, which lives in a separate '
  'Supabase project; integrity is not enforced at the database level and '
  'cross-referencing happens over the API when /design ships.';

create table public.quote_line_items (
  id         uuid primary key default gen_random_uuid(),
  quote_id   uuid not null references public.quotes (id) on delete cascade,
  position   int not null,
  description text,
  quantity   numeric(10,2),
  unit       text,
  unit_price numeric(12,2),
  amount     numeric(12,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index quote_line_items_quote_id_idx on public.quote_line_items (quote_id);

-- invoices ── restrict on job_id: a job with money on it cannot vanish.
create table public.invoices (
  id                  uuid primary key default gen_random_uuid(),
  job_id              uuid not null references public.jobs (id) on delete restrict,
  quote_id            uuid references public.quotes (id) on delete set null,  -- where it came from
  invoice_number      text unique not null,             -- from next_document_number('INV'); gapless
  status              invoice_status not null default 'draft',
  issue_date          date,
  due_date            date,
  subtotal            numeric(12,2),
  tax_rate            numeric(5,4),  -- stored per invoice, never read from a constant; ON HST = 0.1300 today (DECISIONS 005)
  tax_amount          numeric(12,2),
  total               numeric(12,2),
  amount_paid         numeric(12,2) not null default 0, -- maintained by trigger from payments (Slice 8)
  stripe_payment_link text,
  sent_at             timestamptz,
  paid_at             timestamptz,
  voided_at           timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index invoices_job_id_idx   on public.invoices (job_id);
create index invoices_quote_id_idx on public.invoices (quote_id);

create table public.invoice_line_items (
  id         uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  position   int not null,
  description text,
  quantity   numeric(10,2),
  unit       text,
  unit_price numeric(12,2),
  amount     numeric(12,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index invoice_line_items_invoice_id_idx on public.invoice_line_items (invoice_id);

-- payments ── manual entry (e-transfer, cheque) is the first-class path.
-- restrict everywhere: money records never vanish via cascade.
create table public.payments (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null references public.jobs (id) on delete restrict,
  invoice_id  uuid references public.invoices (id) on delete restrict,
  kind        payment_kind not null,
  method      payment_method not null,
  amount      numeric(12,2) not null,
  received_at date not null,
  reference   text,                                     -- e-transfer confirmation, cheque number
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index payments_job_id_idx     on public.payments (job_id);
create index payments_invoice_id_idx on public.payments (invoice_id);

-- contracts ── body_snapshot is the full text exactly as sent, never a
-- template reference. The audit-trail columns are what make an e-signature
-- defensible under Ontario's Electronic Commerce Act (DECISIONS 007).
create table public.contracts (
  id                   uuid primary key default gen_random_uuid(),
  job_id               uuid not null references public.jobs (id) on delete restrict,
  template_version     text not null,
  body_snapshot        text not null,
  status               contract_status not null default 'draft',
  sign_token           text unique,                     -- single-use, for the public signing link
  token_expires_at     timestamptz,
  sent_at              timestamptz,
  signed_at            timestamptz,
  signer_name          text,
  signer_email         text,
  signer_ip            inet,
  signature_image_path text,
  signed_pdf_path      text,                            -- Storage path, immutable
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index contracts_job_id_idx on public.contracts (job_id);

-- tasks
create table public.tasks (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid references public.jobs (id) on delete set null,
  title        text not null,
  assigned_to  uuid references public.profiles (id) on delete set null,
  due_date     date,
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index tasks_job_id_idx      on public.tasks (job_id);
create index tasks_assigned_to_idx on public.tasks (assigned_to);

-- files ── metadata for objects in the private job-files bucket.
-- Deleted only through delete_file(), which removes the Storage object too.
create table public.files (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid not null references public.jobs (id) on delete cascade,
  kind         file_kind not null,
  storage_path text not null,                           -- jobs/{job_id}/{uuid}-{filename}
  filename     text,
  size_bytes   bigint,
  uploaded_by  uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index files_job_id_idx      on public.files (job_id);
create index files_uploaded_by_idx on public.files (uploaded_by);

-- calls ── one row per Twilio voice call. Written only by record_call()
-- (service role); the paired activities row is what shows on timelines.
create table public.calls (
  id                uuid primary key default gen_random_uuid(),
  activity_id       uuid not null unique references public.activities (id) on delete restrict,
  job_id            uuid references public.jobs (id) on delete set null,
  contact_id        uuid not null references public.contacts (id) on delete restrict,
  direction         call_direction not null,
  from_number       text not null,
  to_number         text not null,
  outcome           call_outcome,
  started_at        timestamptz,
  answered_at       timestamptz,
  ended_at          timestamptz,
  duration_seconds  int,
  recording_path    text,                               -- comms bucket; copied from Twilio, we control retention
  consent_announced boolean not null default false,     -- the pre-connect PIPEDA announcement played
  provider_call_sid text unique not null,               -- idempotency key — webhook replays land here
  notes             text,                               -- the only client-updatable column (see section 12)
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint calls_from_e164 check (from_number ~ '^\+[1-9]\d{1,14}$'),
  constraint calls_to_e164   check (to_number   ~ '^\+[1-9]\d{1,14}$')
);

create index calls_job_id_idx     on public.calls (job_id);
create index calls_contact_id_idx on public.calls (contact_id);

-- messages ── one row per SMS/MMS, threaded per contact.
create table public.messages (
  id                   uuid primary key default gen_random_uuid(),
  activity_id          uuid not null unique references public.activities (id) on delete restrict,
  job_id               uuid references public.jobs (id) on delete set null,
  contact_id           uuid not null references public.contacts (id) on delete restrict,
  direction            call_direction not null,
  from_number          text not null,
  to_number            text not null,
  body                 text,
  status               message_status not null,
  media_paths          text[],                          -- comms bucket; inbound MMS media copied there
  sent_at              timestamptz,
  delivered_at         timestamptz,
  error_code           text,
  provider_message_sid text unique not null,            -- idempotency key
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint messages_from_e164 check (from_number ~ '^\+[1-9]\d{1,14}$'),
  constraint messages_to_e164   check (to_number   ~ '^\+[1-9]\d{1,14}$')
);

create index messages_job_id_idx     on public.messages (job_id);
create index messages_contact_id_idx on public.messages (contact_id);

-- consent_records ── append-only CASL/PIPEDA evidence. Withdrawal is a new
-- row, never an update. Consent attaches to the NUMBER (carriers opt out
-- numbers, not people); contact linkage is for reporting.
create table public.consent_records (
  id           uuid primary key default gen_random_uuid(),
  contact_id   uuid not null references public.contacts (id) on delete restrict,
  phone_number text not null,
  channel      consent_channel not null,
  status       consent_status not null,
  source       text not null,                           -- e.g. inbound_sms, web_form, verbal, pre_connect_announcement
  evidence     jsonb,                                   -- e.g. the inbound message SID + body constituting the grant
  granted_at   timestamptz,
  expires_at   timestamptz,                             -- CASL implied consent expires
  withdrawn_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint consent_records_phone_e164 check (phone_number ~ '^\+[1-9]\d{1,14}$')
);

create index consent_records_contact_id_idx on public.consent_records (contact_id);
-- The consent trigger's exact lookup: latest record for (number, channel).
create index consent_records_lookup_idx
  on public.consent_records (phone_number, channel, created_at desc);

-- inbound_leads ── raw payload FIRST, parsing second (DECISIONS 015).
-- parsed_phone deliberately has NO E.164 check: third parties send arbitrary
-- formats, and a CHECK here would reject the INSERT and lose the lead — the
-- exact failure raw_payload exists to prevent. Normalise at conversion, when
-- writing contacts.phone (which IS constrained).
create table public.inbound_leads (
  id             uuid primary key default gen_random_uuid(),
  provider       lead_provider not null,
  raw_payload    jsonb not null,                        -- the untouched body, always
  received_at    timestamptz not null default now(),
  parsed_name    text,
  parsed_phone   text,                                  -- no CHECK — see above
  parsed_email   text,
  parsed_message text,
  parse_error    text,                                  -- null when parsing succeeded
  contact_id     uuid references public.contacts (id) on delete set null,  -- set on conversion
  job_id         uuid references public.jobs (id) on delete set null,      -- set on conversion
  converted_at   timestamptz,
  discarded_at   timestamptz,                           -- spam is discarded, never deleted
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index inbound_leads_contact_id_idx on public.inbound_leads (contact_id);
create index inbound_leads_job_id_idx     on public.inbound_leads (job_id);


-- ----------------------------------------------------------------------------
-- 5. updated_at TRIGGERS
-- Uniform on every table — including append-only ones, where it is a no-op
-- because the guard fires first. One pattern beats a set of exceptions.
-- ----------------------------------------------------------------------------

create trigger trg_profiles_updated_at           before update on public.profiles           for each row execute function public.set_updated_at();
create trigger trg_companies_updated_at          before update on public.companies          for each row execute function public.set_updated_at();
create trigger trg_contacts_updated_at           before update on public.contacts           for each row execute function public.set_updated_at();
create trigger trg_jobs_updated_at               before update on public.jobs               for each row execute function public.set_updated_at();
create trigger trg_activities_updated_at         before update on public.activities         for each row execute function public.set_updated_at();
create trigger trg_appointments_updated_at       before update on public.appointments       for each row execute function public.set_updated_at();
create trigger trg_quotes_updated_at             before update on public.quotes             for each row execute function public.set_updated_at();
create trigger trg_quote_line_items_updated_at   before update on public.quote_line_items   for each row execute function public.set_updated_at();
create trigger trg_invoices_updated_at           before update on public.invoices           for each row execute function public.set_updated_at();
create trigger trg_invoice_line_items_updated_at before update on public.invoice_line_items for each row execute function public.set_updated_at();
create trigger trg_payments_updated_at           before update on public.payments           for each row execute function public.set_updated_at();
create trigger trg_contracts_updated_at          before update on public.contracts          for each row execute function public.set_updated_at();
create trigger trg_tasks_updated_at              before update on public.tasks              for each row execute function public.set_updated_at();
create trigger trg_files_updated_at              before update on public.files              for each row execute function public.set_updated_at();
create trigger trg_calls_updated_at              before update on public.calls              for each row execute function public.set_updated_at();
create trigger trg_messages_updated_at           before update on public.messages           for each row execute function public.set_updated_at();
create trigger trg_consent_records_updated_at    before update on public.consent_records    for each row execute function public.set_updated_at();
create trigger trg_inbound_leads_updated_at      before update on public.inbound_leads      for each row execute function public.set_updated_at();


-- ----------------------------------------------------------------------------
-- 6. DELETE-POLICY AND APPEND-ONLY GUARDS
-- The matrix from docs/SCHEMA.md, enforced for every role including the
-- service role and the dashboard.
--   soft delete only:   companies, contacts, jobs
--   hard delete:        tasks, appointments (RLS policy, section 12);
--                       line items only while parent is draft (guards below);
--                       files only via delete_file() (guard trigger below)
--   permanently denied: activities, calls, messages, payments, quotes,
--                       invoices, contracts, consent_records, inbound_leads
-- ----------------------------------------------------------------------------

-- Append-only: no update, no delete.
create trigger trg_activities_append_only      before update or delete on public.activities      for each row execute function public.block_mutation();
create trigger trg_consent_records_append_only before update or delete on public.consent_records for each row execute function public.block_mutation();

-- Delete denied. (a) soft-delete tables:
create trigger trg_companies_no_delete before delete on public.companies for each row execute function public.block_mutation();
create trigger trg_contacts_no_delete  before delete on public.contacts  for each row execute function public.block_mutation();
create trigger trg_jobs_no_delete      before delete on public.jobs      for each row execute function public.block_mutation();

-- (b) permanent records:
create trigger trg_calls_no_delete         before delete on public.calls         for each row execute function public.block_mutation();
create trigger trg_messages_no_delete      before delete on public.messages      for each row execute function public.block_mutation();
create trigger trg_payments_no_delete      before delete on public.payments      for each row execute function public.block_mutation();
create trigger trg_quotes_no_delete        before delete on public.quotes        for each row execute function public.block_mutation();
create trigger trg_invoices_no_delete      before delete on public.invoices      for each row execute function public.block_mutation();
create trigger trg_contracts_no_delete     before delete on public.contracts     for each row execute function public.block_mutation();
create trigger trg_inbound_leads_no_delete before delete on public.inbound_leads for each row execute function public.block_mutation();

-- Line items: hard delete only while the parent document is draft. Once the
-- parent leaves draft the whole document freezes anyway (Slice 8 immutability
-- trigger); this keeps the delete rule true from day one.
create function public.quote_line_item_delete_guard()
returns trigger
language plpgsql
as $$
begin
  if (select status from public.quotes where id = old.quote_id) <> 'draft' then
    raise exception 'line items can only be deleted while the quote is draft';
  end if;
  return old;
end;
$$;

create function public.invoice_line_item_delete_guard()
returns trigger
language plpgsql
as $$
begin
  if (select status from public.invoices where id = old.invoice_id) <> 'draft' then
    raise exception 'line items can only be deleted while the invoice is draft';
  end if;
  return old;
end;
$$;

create trigger trg_quote_line_items_draft_only   before delete on public.quote_line_items   for each row execute function public.quote_line_item_delete_guard();
create trigger trg_invoice_line_items_draft_only before delete on public.invoice_line_items for each row execute function public.invoice_line_item_delete_guard();

-- files: hard delete is permitted, but ONLY through delete_file(), which
-- removes the Storage object in the same transaction — a direct DELETE would
-- orphan the object in a private bucket forever. The guard checks a
-- transaction-local flag that only delete_file() sets, so this binds every
-- role: clients, the service role, and the dashboard alike.
create function public.files_delete_guard()
returns trigger
language plpgsql
as $$
begin
  if current_setting('app.delete_file_authorized', true) is distinct from old.id::text then
    raise exception 'DELETE on files is only allowed through delete_file()'
      using hint = 'delete_file() also removes the Storage object; a direct DELETE would orphan it.';
  end if;
  return old;
end;
$$;

create trigger trg_files_delete_via_rpc
  before delete on public.files
  for each row execute function public.files_delete_guard();


-- ----------------------------------------------------------------------------
-- 7. STAGE-CHANGE TRIGGER
-- Writes the stage_change activity row (cycle-time reporting depends on it)
-- and stamps won_at / lost_at. Application code never writes those columns.
-- Fires on UPDATE only — seed data inserts jobs already at their stage
-- without fabricating history. Security definer so the activities insert
-- works regardless of the caller's RLS context; auth.uid() is null for
-- SQL-editor changes, which activities.user_id allows.
-- ----------------------------------------------------------------------------

create function public.log_stage_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into activities (job_id, contact_id, kind, meta, user_id)
  values (
    new.id,
    new.contact_id,
    'stage_change',
    jsonb_build_object('from', old.stage, 'to', new.stage),
    auth.uid()
  );

  if new.stage = 'won' and new.won_at is null then
    new.won_at := now();
  elsif new.stage = 'lost' and new.lost_at is null then
    new.lost_at := now();
  end if;

  return new;
end;
$$;

create trigger trg_jobs_stage_change
  before update of stage on public.jobs
  for each row
  when (old.stage is distinct from new.stage)
  execute function public.log_stage_change();


-- ----------------------------------------------------------------------------
-- 8. SMS CONSENT TRIGGER
-- The database-level STOP guarantee: an outbound message to a number whose
-- latest sms consent record is withdrawn cannot be inserted — by any role,
-- including the service role. The send edge function additionally fails
-- CLOSED (no valid unexpired grant, no send); that fuller CASL check lives in
-- app code, this trigger is the hard backstop (DECISIONS 012).
-- ----------------------------------------------------------------------------

create function public.enforce_sms_consent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_latest consent_status;
begin
  if new.direction = 'outbound' then
    select cr.status into v_latest
    from consent_records cr
    where cr.phone_number = new.to_number
      and cr.channel = 'sms'
    order by cr.created_at desc
    limit 1;

    if v_latest = 'withdrawn' then
      raise exception 'outbound SMS to % blocked: consent withdrawn (STOP)', new.to_number;
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_messages_consent
  before insert on public.messages
  for each row
  execute function public.enforce_sms_consent();


-- ----------------------------------------------------------------------------
-- 9. COMMS WRITE PATH — record_call() / record_message()
-- The only way calls and messages are written. Edge functions cannot wrap two
-- inserts in one transaction, so atomicity (comms row + its activities row)
-- and idempotency (unique provider SID) live here. A replayed webhook updates
-- the existing row and returns its id — one row, never two.
-- Execution is revoked from clients in section 12: only the service role
-- (i.e. our edge functions) may call these.
-- ----------------------------------------------------------------------------

create function public.record_call(
  p_provider_call_sid text,
  p_direction         call_direction,
  p_from_number       text,
  p_to_number         text,
  p_contact_id        uuid,
  p_job_id            uuid default null,
  p_outcome           call_outcome default null,
  p_started_at        timestamptz default null,
  p_answered_at       timestamptz default null,
  p_ended_at          timestamptz default null,
  p_duration_seconds  int default null,
  p_recording_path    text default null,
  p_consent_announced boolean default false,
  p_body              text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_call_id     uuid;
  v_activity_id uuid;
begin
  select id into v_call_id from calls where provider_call_sid = p_provider_call_sid;

  if v_call_id is not null then
    -- Replay or status progression: fill in what the earlier webhook lacked
    -- (coalesce keeps existing values), never a second row.
    update calls set
      outcome           = coalesce(p_outcome, outcome),
      started_at        = coalesce(p_started_at, started_at),
      answered_at       = coalesce(p_answered_at, answered_at),
      ended_at          = coalesce(p_ended_at, ended_at),
      duration_seconds  = coalesce(p_duration_seconds, duration_seconds),
      recording_path    = coalesce(p_recording_path, recording_path),
      consent_announced = consent_announced or p_consent_announced
    where id = v_call_id;
    return v_call_id;
  end if;

  insert into activities (job_id, contact_id, kind, body)
  values (p_job_id, p_contact_id, 'call', p_body)
  returning id into v_activity_id;

  begin
    insert into calls (
      activity_id, job_id, contact_id, direction, from_number, to_number,
      outcome, started_at, answered_at, ended_at, duration_seconds,
      recording_path, consent_announced, provider_call_sid
    ) values (
      v_activity_id, p_job_id, p_contact_id, p_direction, p_from_number, p_to_number,
      p_outcome, p_started_at, p_answered_at, p_ended_at, p_duration_seconds,
      p_recording_path, p_consent_announced, p_provider_call_sid
    )
    returning id into v_call_id;
  exception when unique_violation then
    -- Two webhook deliveries raced past the select above; the loser lands
    -- here. Return the winner's row — still exactly one call.
    select id into v_call_id from calls where provider_call_sid = p_provider_call_sid;
  end;

  return v_call_id;
end;
$$;

create function public.record_message(
  p_provider_message_sid text,
  p_direction            call_direction,
  p_from_number          text,
  p_to_number            text,
  p_contact_id           uuid,
  p_status               message_status,
  p_job_id               uuid default null,
  p_body                 text default null,
  p_media_paths          text[] default null,
  p_sent_at              timestamptz default null,
  p_delivered_at         timestamptz default null,
  p_error_code           text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_message_id  uuid;
  v_activity_id uuid;
begin
  select id into v_message_id from messages where provider_message_sid = p_provider_message_sid;

  if v_message_id is not null then
    -- Delivery-status progression on an existing message.
    update messages set
      status       = p_status,
      sent_at      = coalesce(p_sent_at, sent_at),
      delivered_at = coalesce(p_delivered_at, delivered_at),
      error_code   = coalesce(p_error_code, error_code)
    where id = v_message_id;
    return v_message_id;
  end if;

  insert into activities (job_id, contact_id, kind, body)
  values (p_job_id, p_contact_id, 'sms', p_body)
  returning id into v_activity_id;

  begin
    insert into messages (
      activity_id, job_id, contact_id, direction, from_number, to_number,
      body, status, media_paths, sent_at, delivered_at, error_code,
      provider_message_sid
    ) values (
      v_activity_id, p_job_id, p_contact_id, p_direction, p_from_number, p_to_number,
      p_body, p_status, p_media_paths, p_sent_at, p_delivered_at, p_error_code,
      p_provider_message_sid
    )
    returning id into v_message_id;
  exception when unique_violation then
    select id into v_message_id from messages where provider_message_sid = p_provider_message_sid;
  end;

  return v_message_id;
end;
$$;


-- ----------------------------------------------------------------------------
-- 10. delete_file()
-- The only way to delete a file: removes the Storage object and the files row
-- in one transaction, so the private bucket never accumulates orphans that
-- nothing will ever clean up. Clients get no direct DELETE on files at all.
-- ----------------------------------------------------------------------------

create function public.delete_file(p_file_id uuid)
returns void
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  v_path text;
begin
  select storage_path into v_path from public.files where id = p_file_id;
  if v_path is null then
    raise exception 'file % not found', p_file_id;
  end if;

  -- Transaction-local authorization for this one row; files_delete_guard()
  -- rejects any DELETE not flagged this way. Resets automatically at commit.
  perform set_config('app.delete_file_authorized', p_file_id::text, true);

  delete from storage.objects where bucket_id = 'job-files' and name = v_path;
  delete from public.files where id = p_file_id;
end;
$$;


-- ----------------------------------------------------------------------------
-- 11. STORAGE BUCKETS
-- Both private. Access policies arrive with the slices that upload (3, 10);
-- until then nothing can read or write them through the storage API.
--   job-files: jobs/{job_id}/{uuid}-{filename}
--   comms:     calls/{call_id}/recording.mp3, messages/{message_id}/{filename}
-- ----------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('job-files', 'job-files', false), ('comms', 'comms', false)
on conflict (id) do nothing;


-- ----------------------------------------------------------------------------
-- 12. ROW LEVEL SECURITY AND PRIVILEGE GRANTS
-- Single-office team: authenticated staff see everything (DECISIONS 009).
-- No anon access to anything, ever — public pages go through edge functions
-- with the service role (DECISIONS 008). The delete matrix is mostly enforced
-- by the triggers in section 6; RLS adds the client-facing layer.
-- ----------------------------------------------------------------------------

alter table public.profiles           enable row level security;
alter table public.companies          enable row level security;
alter table public.contacts           enable row level security;
alter table public.jobs               enable row level security;
alter table public.activities         enable row level security;
alter table public.appointments       enable row level security;
alter table public.quotes             enable row level security;
alter table public.quote_line_items   enable row level security;
alter table public.invoices           enable row level security;
alter table public.invoice_line_items enable row level security;
alter table public.payments           enable row level security;
alter table public.contracts          enable row level security;
alter table public.tasks              enable row level security;
alter table public.files              enable row level security;
alter table public.calls              enable row level security;
alter table public.messages           enable row level security;
alter table public.consent_records    enable row level security;
alter table public.inbound_leads      enable row level security;

-- Every table: staff read.
create policy "staff select" on public.profiles           for select to authenticated using (true);
create policy "staff select" on public.companies          for select to authenticated using (true);
create policy "staff select" on public.contacts           for select to authenticated using (true);
create policy "staff select" on public.jobs               for select to authenticated using (true);
create policy "staff select" on public.activities         for select to authenticated using (true);
create policy "staff select" on public.appointments       for select to authenticated using (true);
create policy "staff select" on public.quotes             for select to authenticated using (true);
create policy "staff select" on public.quote_line_items   for select to authenticated using (true);
create policy "staff select" on public.invoices           for select to authenticated using (true);
create policy "staff select" on public.invoice_line_items for select to authenticated using (true);
create policy "staff select" on public.payments           for select to authenticated using (true);
create policy "staff select" on public.contracts          for select to authenticated using (true);
create policy "staff select" on public.tasks              for select to authenticated using (true);
create policy "staff select" on public.files              for select to authenticated using (true);
create policy "staff select" on public.calls              for select to authenticated using (true);
create policy "staff select" on public.messages           for select to authenticated using (true);
create policy "staff select" on public.consent_records    for select to authenticated using (true);
create policy "staff select" on public.inbound_leads      for select to authenticated using (true);

-- Operational tables: staff insert + update.
create policy "staff insert" on public.companies          for insert to authenticated with check (true);
create policy "staff update" on public.companies          for update to authenticated using (true) with check (true);
create policy "staff insert" on public.contacts           for insert to authenticated with check (true);
create policy "staff update" on public.contacts           for update to authenticated using (true) with check (true);
create policy "staff insert" on public.jobs               for insert to authenticated with check (true);
create policy "staff update" on public.jobs               for update to authenticated using (true) with check (true);
create policy "staff insert" on public.appointments       for insert to authenticated with check (true);
create policy "staff update" on public.appointments       for update to authenticated using (true) with check (true);
create policy "staff insert" on public.quotes             for insert to authenticated with check (true);
create policy "staff update" on public.quotes             for update to authenticated using (true) with check (true);
create policy "staff insert" on public.quote_line_items   for insert to authenticated with check (true);
create policy "staff update" on public.quote_line_items   for update to authenticated using (true) with check (true);
create policy "staff insert" on public.invoices           for insert to authenticated with check (true);
create policy "staff update" on public.invoices           for update to authenticated using (true) with check (true);
create policy "staff insert" on public.invoice_line_items for insert to authenticated with check (true);
create policy "staff update" on public.invoice_line_items for update to authenticated using (true) with check (true);
create policy "staff insert" on public.payments           for insert to authenticated with check (true);
create policy "staff update" on public.payments           for update to authenticated using (true) with check (true);
create policy "staff insert" on public.contracts          for insert to authenticated with check (true);
create policy "staff update" on public.contracts          for update to authenticated using (true) with check (true);
create policy "staff insert" on public.tasks              for insert to authenticated with check (true);
create policy "staff update" on public.tasks              for update to authenticated using (true) with check (true);
create policy "staff insert" on public.files              for insert to authenticated with check (true);
create policy "staff update" on public.files              for update to authenticated using (true) with check (true);
create policy "staff insert" on public.inbound_leads      for insert to authenticated with check (true);
create policy "staff update" on public.inbound_leads      for update to authenticated using (true) with check (true);
-- (inbound_leads update = triage: linking contact/job, converted_at, discarded_at.)

-- profiles: a user updates only their own row. Rows are created by the
-- signup trigger (Slice 1), so no insert policy.
create policy "own profile update" on public.profiles
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- activities: staff may append (notes, logged meetings). The append-only
-- guard blocks update/delete; no policies for those verbs either.
create policy "staff insert" on public.activities for insert to authenticated with check (true);

-- consent_records: staff may record consent gathered by hand (verbal, paper
-- form). Append-only beyond that.
create policy "staff insert" on public.consent_records for insert to authenticated with check (true);

-- tasks + appointments: the only tables where clients may hard-delete freely.
create policy "staff delete" on public.tasks        for delete to authenticated using (true);
create policy "staff delete" on public.appointments for delete to authenticated using (true);

-- Line items: deletable by staff, but only while the parent is draft — the
-- section 6 guard enforces the condition.
create policy "staff delete" on public.quote_line_items   for delete to authenticated using (true);
create policy "staff delete" on public.invoice_line_items for delete to authenticated using (true);

-- calls + messages: read-only for clients. Rows are written exclusively by
-- record_call()/record_message() under the service role, so there are no
-- insert policies; column-level grants below allow exactly calls.notes to be
-- edited by staff and nothing else. Supabase's default grants give
-- authenticated full DML on new tables — revoke first, then re-grant narrow.
revoke insert, update, delete on public.calls    from authenticated;
revoke insert, update, delete on public.messages from authenticated;
grant update (notes) on public.calls to authenticated;

create policy "staff update notes" on public.calls
  for update to authenticated using (true) with check (true);

-- files: no delete policy and no DELETE grant — deletion happens only inside
-- delete_file() (security definer).
revoke delete on public.files from authenticated;

-- Comms write path is service-role only: revoke from everyone, grant back
-- narrowly. (Functions default to EXECUTE for public.)
revoke execute on function public.record_call(text, call_direction, text, text, uuid, uuid, call_outcome, timestamptz, timestamptz, timestamptz, int, text, boolean, text) from public, anon, authenticated;
revoke execute on function public.record_message(text, call_direction, text, text, uuid, message_status, uuid, text, text[], timestamptz, timestamptz, text) from public, anon, authenticated;

-- next_document_number stays callable by staff — job/quote/invoice creation
-- happens client-side. delete_file is the staff path for removing files.
grant execute on function public.next_document_number(text) to authenticated;
grant execute on function public.delete_file(uuid) to authenticated;
