-- Slice 42 — platform admins can create client businesses from the Agency
-- view. Seeding is shared with self-serve registration; creating a client
-- does NOT switch the creator's own workspace, and an optional admin email
-- (an already-signed-up user) becomes the client's first admin.

create or replace function public.seed_business_defaults(v_business uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into business_settings (business_id, name) values (v_business, p_name);
  insert into stage_settings (business_id, stage, label, position, phase, hidden) values
    (v_business, 'new', 'New', 0, 'pipeline', false),
    (v_business, 'contacted', 'Contacted', 1, 'pipeline', false),
    (v_business, 'quoted', 'Quoted', 2, 'pipeline', false),
    (v_business, 'follow_up', 'Follow up', 3, 'pipeline', false),
    (v_business, 'won', 'Won', 4, 'production', false),
    (v_business, 'templated', 'Templated', 5, 'production', false),
    (v_business, 'fabrication', 'Fabrication', 6, 'production', false),
    (v_business, 'scheduled', 'Scheduled', 7, 'production', false),
    (v_business, 'installed', 'Installed', 8, 'production', false),
    (v_business, 'closed', 'Closed', 9, 'production', false),
    (v_business, 'lost', 'Lost', 10, 'pipeline', false),
    (v_business, 'custom_1', 'Custom 1', 20, 'pipeline', true),
    (v_business, 'custom_2', 'Custom 2', 21, 'pipeline', true),
    (v_business, 'custom_3', 'Custom 3', 22, 'pipeline', true),
    (v_business, 'custom_4', 'Custom 4', 23, 'pipeline', true),
    (v_business, 'custom_5', 'Custom 5', 24, 'pipeline', true),
    (v_business, 'custom_6', 'Custom 6', 25, 'pipeline', true);
  insert into option_items (business_id, list_key, value, position) values
    (v_business, 'lead_sources', 'referral', 0), (v_business, 'lead_sources', 'website', 1),
    (v_business, 'lead_sources', 'meta', 2), (v_business, 'lead_sources', 'google', 3),
    (v_business, 'lead_sources', 'repeat client', 4),
    (v_business, 'job_roles', 'Owner', 0), (v_business, 'job_roles', 'Sales', 1),
    (v_business, 'job_roles', 'Production Manager', 2), (v_business, 'job_roles', 'Installer', 3),
    (v_business, 'job_roles', 'Office Admin', 4);
end;
$$;

create or replace function public.register_business(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business uuid;
begin
  if p_name is null or btrim(p_name) = '' then
    raise exception 'business name is required';
  end if;
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  insert into businesses (name, created_by) values (btrim(p_name), auth.uid())
  returning id into v_business;
  insert into business_members (business_id, user_id, role) values (v_business, auth.uid(), 'admin');
  update profiles set active_business_id = v_business where id = auth.uid();
  perform public.seed_business_defaults(v_business, btrim(p_name));
  return v_business;
end;
$$;

create or replace function public.create_client_business(p_name text, p_admin_email text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business uuid;
  v_admin uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'platform admins only';
  end if;
  if p_name is null or btrim(p_name) = '' then
    raise exception 'business name is required';
  end if;
  insert into businesses (name, created_by) values (btrim(p_name), auth.uid())
  returning id into v_business;
  perform public.seed_business_defaults(v_business, btrim(p_name));

  if p_admin_email is not null and btrim(p_admin_email) <> '' then
    select id into v_admin from profiles where lower(email) = lower(btrim(p_admin_email));
    if v_admin is null then
      raise exception 'no account found for % — ask them to sign up first, then add them from Settings → Team', p_admin_email;
    end if;
    insert into business_members (business_id, user_id, role) values (v_business, v_admin, 'admin');
    update profiles set active_business_id = v_business
    where id = v_admin and active_business_id is null;
  end if;

  -- The platform admin joins as admin too (so the workspace is enterable),
  -- but their own active business is left untouched.
  insert into business_members (business_id, user_id, role)
  values (v_business, auth.uid(), 'admin')
  on conflict (business_id, user_id) do nothing;
  return v_business;
end;
$$;

grant execute on function public.create_client_business(text, text) to authenticated;
