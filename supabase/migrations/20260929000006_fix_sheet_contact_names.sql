-- Fix contacts whose full_name was set to a phone number because the
-- sync-lead-sheets column mapper didn't recognise short headers like "p".
-- Strategy:
--   1. Where inbound_leads.parsed_name contains a real name (not a phone
--      number and not empty), push it back onto the contact's full_name.
--   2. Where jobs.city is set but contacts.city is empty for the same
--      contact, backfill the city (jobs inherit it from contact or site_address).
--   3. Re-run the "First Name - City" title backfill across all non-deleted
--      jobs whose contact now has a corrected name.
--
-- Safe to re-run: UPDATE … WHERE is idempotent.

-- Step 1: fix contact full_name from the lead's parsed_name where the
-- current full_name looks like a phone number.
update public.contacts c
set full_name = il.parsed_name
from public.inbound_leads il
where il.contact_id = c.id
  and il.parsed_name is not null
  and trim(il.parsed_name) <> ''
  -- parsed_name itself must NOT look like a phone (guard against old bad data)
  and not (il.parsed_name ~ '^\+?[\d\s\-().]{7,}$')
  -- only touch contacts whose current name looks like a phone number
  and (
    c.full_name ~ '^\+?[\d\s\-().]{7,}$'
    or c.full_name ilike 'sheet lead'
    or c.full_name is null
    or trim(c.full_name) = ''
  );

-- Step 2: backfill contacts.city from jobs.city where the job has a city
-- but the contact doesn't (common when city came from a sheet column).
update public.contacts c
set city = j.city
from public.jobs j
where j.contact_id = c.id
  and j.deleted_at is null
  and j.city is not null
  and trim(j.city) <> ''
  and (c.city is null or trim(c.city) = '');

-- Step 3: re-run the "First Name - City" title backfill now that contact
-- names and cities are corrected.
update public.jobs j
set title =
  case
    when c.city is not null and trim(c.city) != ''
      then split_part(c.full_name, ' ', 1) || ' - ' || trim(c.city)
    else
      split_part(c.full_name, ' ', 1)
  end
from public.contacts c
where j.contact_id = c.id
  and j.deleted_at is null
  -- only touch jobs whose title still looks like a phone number or raw email
  and (
    j.title ~ '^\+?[\d\s\-().]{7,}$'
    or j.title ilike '%@%'
    or j.title ilike 'sheet lead'
    or j.title ilike '% lead'
  );
