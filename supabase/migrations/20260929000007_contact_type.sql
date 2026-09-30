-- Add contact_type to contacts: homeowner, builder, or contractor.
-- Nullable — existing contacts keep null until manually set.

create type public.contact_type as enum ('homeowner', 'builder', 'contractor');

alter table public.contacts
  add column contact_type public.contact_type;
