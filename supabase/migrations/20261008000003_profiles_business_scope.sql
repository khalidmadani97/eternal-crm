-- Scope profile visibility to the current active business.
-- Previously "using (true)" returned all profiles across all tenants,
-- causing duplicate names when a user belongs to multiple businesses.

create policy "business scope" on public.profiles
  as restrictive for select to authenticated
  using (
    public.is_platform_admin()
    or id = auth.uid()
    or id in (
      select user_id from public.business_members
      where business_id = public.current_business()
    )
  );
