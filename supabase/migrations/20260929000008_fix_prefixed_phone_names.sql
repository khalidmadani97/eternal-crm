-- Fix contacts where full_name is a phone number with a column-header prefix
-- (e.g. "p:+14165551234") — a pattern the previous fix didn't catch because
-- the regex required the value to start with + or a digit.
--
-- Strategy: pull the real name directly from inbound_leads.raw_payload using
-- the known 'names' column key (the actual sheet header), which was always
-- stored correctly in raw_payload even when the column mapping was wrong.

-- Step 1: fix contacts whose full_name matches a phone-like pattern,
-- including the "p:..." prefix form, using the value from raw_payload.
update public.contacts c
set full_name = coalesce(
  -- try common variations of the "names" column key as it appears in the sheet
  nullif(trim(il.raw_payload->>'names'), ''),
  nullif(trim(il.raw_payload->>'Names'), ''),
  nullif(trim(il.raw_payload->>'name'), ''),
  nullif(trim(il.raw_payload->>'Name'), ''),
  nullif(trim(il.raw_payload->>'full name'), ''),
  nullif(trim(il.raw_payload->>'full_name'), '')
)
from public.inbound_leads il
where il.contact_id = c.id
  -- contact name is a bare phone number or has the "p:..." prefix
  and (
    c.full_name ~ '^\+?[\d\s\-().]{7,}$'
    or c.full_name ~* '^[a-z]{1,4}:\s*\+?[\d]'
    or lower(trim(c.full_name)) in ('sheet lead', 'unknown', '')
    or c.full_name is null
  )
  -- the value we're about to write must NOT itself be a phone
  and coalesce(
    nullif(trim(il.raw_payload->>'names'), ''),
    nullif(trim(il.raw_payload->>'Names'), ''),
    nullif(trim(il.raw_payload->>'name'), ''),
    nullif(trim(il.raw_payload->>'Name'), '')
  ) is not null
  and not (
    coalesce(
      nullif(trim(il.raw_payload->>'names'), ''),
      nullif(trim(il.raw_payload->>'Names'), ''),
      nullif(trim(il.raw_payload->>'name'), ''),
      nullif(trim(il.raw_payload->>'Name'), '')
    ) ~ '^\+?[\d\s\-().]{7,}$'
    or
    coalesce(
      nullif(trim(il.raw_payload->>'names'), ''),
      nullif(trim(il.raw_payload->>'Names'), ''),
      nullif(trim(il.raw_payload->>'name'), ''),
      nullif(trim(il.raw_payload->>'Name'), '')
    ) ~* '^[a-z]{1,4}:\s*\+?[\d]'
  );

-- Step 2: backfill contacts.city from raw_payload 'city' key where missing.
update public.contacts c
set city = nullif(trim(il.raw_payload->>'city'), '')
from public.inbound_leads il
where il.contact_id = c.id
  and nullif(trim(il.raw_payload->>'city'), '') is not null
  and (c.city is null or trim(c.city) = '');

-- Step 3: re-run the title backfill for jobs whose title is still a phone
-- number (bare or prefixed), an email, or a sheet-name placeholder.
-- Uses full name (not split_part) to produce "Full Name - City".
update public.jobs j
set title =
  case
    when c.city is not null and trim(c.city) != ''
      then trim(c.full_name) || ' - ' || trim(c.city)
    else
      trim(c.full_name)
  end
from public.contacts c
where j.contact_id = c.id
  and j.deleted_at is null
  -- only update jobs that still have a bad title
  and (
    j.title ~ '^\+?[\d\s\-().]{7,}$'
    or j.title ~* '^[a-z]{1,4}:\s*\+?[\d]'
    or j.title ilike '%@%'
    or j.title ilike '% lead'
  )
  -- don't write a phone number as the title
  and not (c.full_name ~ '^\+?[\d\s\-().]{7,}$')
  and not (c.full_name ~* '^[a-z]{1,4}:\s*\+?[\d]');
