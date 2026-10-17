-- Contacts from form submissions start as unconfirmed; reps confirm them
-- after qualifying. All existing contacts are already confirmed by default.
alter table public.contacts add column if not exists confirmed boolean not null default true;

-- Sheet/Sara-created placeholder contacts will have confirmed = false set
-- at insert time going forward. Existing 'New Lead' auto-created contacts
-- are likely unconfirmed placeholders — flip them.
update public.contacts
  set confirmed = false
  where full_name = 'New Lead'
    and auto_created = false
    and phone is null
    and email is null;
