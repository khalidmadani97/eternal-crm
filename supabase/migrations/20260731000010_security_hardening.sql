-- Slice 32 — security hardening (DECISIONS 031).
--
-- 1. Company financials: overhead expenses (job_id null) and therefore the
--    true P&L are admin-only at the DATABASE level. Staff still see and
--    record job-linked costs — they need those to work.
-- 2. Role fields on profiles (role / job_role / responsibilities) can only
--    be changed by admins — a staff user cannot promote themselves. The
--    service role (signup trigger, automation) bypasses.
-- 3. A private backups bucket, service-role only.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

-- expenses: split visibility.
drop policy "staff select" on public.expenses;
create policy "staff select job expenses" on public.expenses
  for select to authenticated
  using (job_id is not null or public.is_admin());
-- Staff cannot create/edit/delete overhead rows either.
drop policy "staff insert" on public.expenses;
create policy "staff insert" on public.expenses
  for insert to authenticated
  with check (job_id is not null or public.is_admin());
drop policy "staff update" on public.expenses;
create policy "staff update" on public.expenses
  for update to authenticated
  using (job_id is not null or public.is_admin())
  with check (job_id is not null or public.is_admin());
drop policy "staff delete" on public.expenses;
create policy "staff delete" on public.expenses
  for delete to authenticated
  using (job_id is not null or public.is_admin());

-- profiles: privilege fields are admin-set only.
create or replace function public.profiles_privilege_guard()
returns trigger
language plpgsql
as $$
begin
  -- service role (signup trigger, admin API, backups) bypasses
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' or auth.uid() is null then
    return new;
  end if;
  if (new.role is distinct from old.role
      or new.job_role is distinct from old.job_role
      or new.responsibilities is distinct from old.responsibilities)
     and not public.is_admin() then
    raise exception 'only an admin can change roles or responsibilities';
  end if;
  return new;
end;
$$;

create trigger trg_profiles_privilege_guard
  before update on public.profiles
  for each row execute function public.profiles_privilege_guard();

-- backups bucket: private; no client policies at all — only the service
-- role (backup function) touches it, and downloads go through signed URLs
-- minted by that admin-gated function.
insert into storage.buckets (id, name, public)
values ('backups', 'backups', false)
on conflict (id) do nothing;
