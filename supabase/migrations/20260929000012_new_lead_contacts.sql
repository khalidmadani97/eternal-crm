-- Mark contacts created by sheet import as New Lead placeholders if they still
-- have a phone-like name. Does NOT touch contacts with a real name (manually
-- set by a rep) or contacts that are already "New Lead".
update public.contacts
set full_name = 'New Lead',
    phone     = null,
    email     = null
where deleted_at is null
  and full_name != 'New Lead'
  and (
    full_name ~ '^\+?[\d\s\-().]{7,}$'
    or full_name ~* '^[a-z]{1,4}:\s*\+?[\d]'
  );
