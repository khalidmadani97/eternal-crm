alter table public.contacts
  add column lead_grade smallint check (lead_grade between 1 and 5);
