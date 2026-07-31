-- Slice 29 — company roles for role-aware briefs (DECISIONS 029).
-- `role` (admin/staff) stays a PERMISSION level. `job_role` is what you do
-- in the company; `responsibilities` is the free-text the AI reads to route
-- each person's Daily Brief — editing that sentence retunes the brief
-- without code.

alter table public.profiles
  add column job_role text,
  add column responsibilities text;

-- Admins may edit any profile (Team settings); everyone still edits their own.
create policy "admin update any profile" on public.profiles
  for update to authenticated
  using (exists (select 1 from public.profiles me where me.id = auth.uid() and me.role = 'admin'))
  with check (true);

insert into public.option_items (list_key, value, position) values
  ('job_roles', 'Owner', 0),
  ('job_roles', 'Sales', 1),
  ('job_roles', 'Production Manager', 2),
  ('job_roles', 'Installer', 3),
  ('job_roles', 'Office Admin', 4);
