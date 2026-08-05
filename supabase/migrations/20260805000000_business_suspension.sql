-- Business suspension (Slice 51, DECISIONS 038): the agency kill-switch.
-- Suspending a business cuts every member's data access instantly because
-- my_business_ids() — the root of every tenant RLS policy — stops returning
-- the suspended business. Platform admins keep full visibility so they can
-- reactivate. No data is deleted; reactivation is one UPDATE.

alter table public.businesses add column suspended_at timestamptz;

create or replace function public.my_business_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select bm.business_id
  from business_members bm
  join businesses b on b.id = bm.business_id
  where bm.user_id = auth.uid()
    and bm.status = 'active'
    and b.suspended_at is null;
$$;

-- Members of a suspended business must still see the business ROW (name +
-- suspended state) so the app can show "workspace suspended" instead of a
-- confusing empty shell. Data tables stay locked via my_business_ids().
drop policy "member select" on public.businesses;
create policy "member select" on public.businesses for select to authenticated
  using (
    public.is_platform_admin()
    or id in (select business_id from business_members
              where user_id = auth.uid() and status = 'active')
  );

-- Platform admins flip the switch through this RPC (businesses has no
-- UPDATE policy for authenticated — service role and this definer only).
create or replace function public.set_business_suspended(p_business_id uuid, p_suspend boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Platform admins only';
  end if;
  update businesses
  set suspended_at = case when p_suspend then now() else null end
  where id = p_business_id;
end;
$$;

revoke all on function public.set_business_suspended(uuid, boolean) from public;
grant execute on function public.set_business_suspended(uuid, boolean) to authenticated;
