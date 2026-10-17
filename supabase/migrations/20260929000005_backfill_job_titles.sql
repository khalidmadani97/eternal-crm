-- Re-run title backfill to catch jobs imported after the initial migration.
-- Safe to run repeatedly: always sets to current "First Name - City" format.

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
  and j.deleted_at is null;
