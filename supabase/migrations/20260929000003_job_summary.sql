-- Job summary field (3-4 word description shown on pipeline cards)
-- + backfill existing job titles to "First Name - City" format.

alter table public.jobs
  add column summary text;

-- Backfill titles: "First name - City" where contact has a city.
-- Only updates non-deleted jobs.  Uses split_part to get first word of full_name.
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
