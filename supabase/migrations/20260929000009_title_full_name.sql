-- Re-backfill all job titles to use the full contact name instead of
-- just the first name. Previous migrations used split_part(..., ' ', 1).
-- Safe to run repeatedly.

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
  -- only touch jobs whose title looks auto-generated (contains ' - ' with a
  -- city, or is a bare name with no spaces that matches the old first-name format)
  -- Exclude manually-set titles that wouldn't follow this pattern.
  and (
    -- old "FirstName - City" format: replace with full name
    j.title ~ '^[A-Za-z]+ - .+'
    -- bare phone/email/placeholder still remaining
    or j.title ~ '^\+?[\d\s\-().]{7,}$'
    or j.title ~* '^[a-z]{1,4}:\s*\+?[\d]'
    or j.title ilike '%@%'
    or j.title ilike '% lead'
  )
  and not (c.full_name ~ '^\+?[\d\s\-().]{7,}$')
  and not (c.full_name ~* '^[a-z]{1,4}:\s*\+?[\d]')
  and trim(c.full_name) not in ('', 'sheet lead', 'unknown');
