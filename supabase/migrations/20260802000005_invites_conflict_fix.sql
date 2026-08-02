-- ON CONFLICT needs a plain unique constraint, not an expression index.
-- Emails are lowercased by the invite function before storage.
drop index if exists public.idx_invites_business_email;
alter table public.invites add constraint invites_business_email_key unique (business_id, email);
