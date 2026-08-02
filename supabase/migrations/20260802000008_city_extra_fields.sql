-- Slice 47 — location split (city + address) and free-form extra fields on
-- contacts and leads/jobs. `extra` is a label→value map users extend from
-- the UI ("+ Add field") without migrations.
alter table public.contacts
  add column city text,
  add column extra jsonb not null default '{}'::jsonb;
alter table public.jobs
  add column city text,
  add column extra jsonb not null default '{}'::jsonb;
