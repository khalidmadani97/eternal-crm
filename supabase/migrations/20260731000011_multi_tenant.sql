-- Slice 33 — multi-tenant accounts (DECISIONS 032).
--
-- Design: one RESTRICTIVE isolation policy per table (business_id must equal
-- the caller's active business) layered ON TOP of the existing verified
-- permission matrix — none of the existing policies change. BEFORE-INSERT
-- triggers fill business_id automatically (explicit value → parent row →
-- caller's active business → the only business), so existing app code keeps
-- working unchanged. The service role is exempt from the restrictive layer
-- (webhooks attribute through parent rows).

-- ── Core tables ──────────────────────────────────────────────────────────────

create table public.businesses (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_businesses_updated_at before update on public.businesses
  for each row execute function public.set_updated_at();

create table public.business_members (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  role        public.user_role not null default 'staff',
  status      text not null default 'active' check (status in ('active', 'suspended')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (business_id, user_id)
);
create index idx_business_members_user on public.business_members (user_id);
create trigger trg_business_members_updated_at before update on public.business_members
  for each row execute function public.set_updated_at();

alter table public.profiles
  add column email text unique,
  add column platform_admin boolean not null default false,
  add column active_business_id uuid references public.businesses (id) on delete set null;

-- Backfill emails; keep them in sync on signup.
update public.profiles p set email = u.email from auth.users u where u.id = p.id;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'staff'),
    new.email
  );
  return new;
end;
$$;

-- ── Helpers ──────────────────────────────────────────────────────────────────

create or replace function public.current_business()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select active_business_id from profiles where id = auth.uid();
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select platform_admin from profiles where id = auth.uid()), false);
$$;

-- Business-level admin (replaces global is_admin semantics inside a business;
-- platform admins count as admin everywhere they enter).
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin()
    or exists (
      select 1 from business_members m
      where m.user_id = auth.uid()
        and m.business_id = public.current_business()
        and m.role = 'admin'
        and m.status = 'active'
    )
    -- pre-tenant fallback: the original global admin flag
    or exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

-- ── The default business (existing single-tenant data lives here) ────────────

insert into public.businesses (id, name)
values ('00000000-0000-4000-9000-000000000001', 'Eternal Interiors')
on conflict (id) do nothing;

-- ── business_id everywhere ───────────────────────────────────────────────────

-- Generic filler: TG_ARGV = pairs of (parent_table, fk_column) to try in
-- order. Fallbacks: caller's active business, then the only business.
create or replace function public.fill_business_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  i int := 0;
  v_parent_table text;
  v_fk_column text;
  v_fk uuid;
  v_business uuid;
begin
  if new.business_id is not null then
    return new;
  end if;
  while i < tg_nargs loop
    v_parent_table := tg_argv[i];
    v_fk_column := tg_argv[i + 1];
    execute format('select ($1).%I', v_fk_column) into v_fk using new;
    if v_fk is not null then
      execute format('select business_id from public.%I where id = $1', v_parent_table)
        into v_business using v_fk;
      if v_business is not null then
        new.business_id := v_business;
        return new;
      end if;
    end if;
    i := i + 2;
  end loop;
  new.business_id := public.current_business();
  if new.business_id is null then
    select id into new.business_id from businesses limit 2;
    if (select count(*) from businesses) > 1 then
      raise exception 'business_id required: multiple businesses exist and none could be derived';
    end if;
  end if;
  if new.business_id is null then
    raise exception 'business_id required and no business exists';
  end if;
  return new;
end;
$$;

do $$
declare
  spec record;
begin
  for spec in
    select * from (values
      ('companies',          null,        null,           null,       null),
      ('contacts',           'companies', 'company_id',   null,       null),
      ('jobs',               'contacts',  'contact_id',   null,       null),
      ('appointments',       'jobs',      'job_id',       null,       null),
      ('quotes',             'jobs',      'job_id',       null,       null),
      ('quote_line_items',   'quotes',    'quote_id',     null,       null),
      ('invoices',           'jobs',      'job_id',       null,       null),
      ('invoice_line_items', 'invoices',  'invoice_id',   null,       null),
      ('payments',           'jobs',      'job_id',       null,       null),
      ('contracts',          'jobs',      'job_id',       null,       null),
      ('activities',         'jobs',      'job_id',       'contacts', 'contact_id'),
      ('tasks',              'jobs',      'job_id',       null,       null),
      ('files',              'jobs',      'job_id',       null,       null),
      ('calls',              'contacts',  'contact_id',   null,       null),
      ('messages',           'contacts',  'contact_id',   null,       null),
      ('dm_messages',        'contacts',  'contact_id',   null,       null),
      ('channel_identities', 'contacts',  'contact_id',   null,       null),
      ('consent_records',    'contacts',  'contact_id',   null,       null),
      ('inbound_leads',      'contacts',  'contact_id',   null,       null),
      ('expenses',           'jobs',      'job_id',       null,       null),
      ('stage_settings',     null,        null,           null,       null),
      ('option_items',       null,        null,           null,       null)
    ) as t(tbl, p1, c1, p2, c2)
  loop
    -- Default keeps generated types optional; the trigger covers service-role
    -- and parent-derived cases where the default is null.
    execute format(
      'alter table public.%I add column business_id uuid default public.current_business() references public.businesses (id) on delete cascade',
      spec.tbl);
    execute format(
      'update public.%I set business_id = ''00000000-0000-4000-9000-000000000001'' where business_id is null',
      spec.tbl);
    execute format('alter table public.%I alter column business_id set not null', spec.tbl);
    execute format('create index idx_%s_business on public.%I (business_id)', spec.tbl, spec.tbl);
    if spec.p2 is not null then
      execute format(
        'create trigger trg_%s_fill_business before insert on public.%I for each row execute function public.fill_business_id(%L, %L, %L, %L)',
        spec.tbl, spec.tbl, spec.p1, spec.c1, spec.p2, spec.c2);
    elsif spec.p1 is not null then
      execute format(
        'create trigger trg_%s_fill_business before insert on public.%I for each row execute function public.fill_business_id(%L, %L)',
        spec.tbl, spec.tbl, spec.p1, spec.c1);
    else
      execute format(
        'create trigger trg_%s_fill_business before insert on public.%I for each row execute function public.fill_business_id()',
        spec.tbl, spec.tbl);
    end if;
    -- The isolation layer: restrictive, authenticated only (service role exempt).
    execute format(
      'create policy tenant_isolation on public.%I as restrictive for all to authenticated using (business_id = public.current_business()) with check (business_id = public.current_business() or business_id is null)',
      spec.tbl);
  end loop;
end;
$$;

-- Per-business uniqueness replaces global uniqueness where needed.
alter table public.stage_settings drop constraint stage_settings_pkey;
alter table public.stage_settings add column id uuid primary key default gen_random_uuid();
alter table public.stage_settings add constraint stage_settings_business_stage_key unique (business_id, stage);
alter table public.option_items drop constraint option_items_list_key_value_key;
alter table public.option_items add constraint option_items_business_list_value_key unique (business_id, list_key, value);
alter table public.jobs drop constraint jobs_job_number_key;
alter table public.jobs add constraint jobs_business_number_key unique (business_id, job_number);
alter table public.quotes drop constraint quotes_quote_number_key;
alter table public.quotes add constraint quotes_business_number_key unique (business_id, quote_number);
alter table public.invoices drop constraint invoices_invoice_number_key;
alter table public.invoices add constraint invoices_business_number_key unique (business_id, invoice_number);

-- business_settings: one row per business now.
alter table public.business_settings add column business_id uuid default public.current_business() unique references public.businesses (id) on delete cascade;
update public.business_settings set business_id = '00000000-0000-4000-9000-000000000001';
alter table public.business_settings alter column business_id set not null;
alter table public.business_settings drop constraint business_settings_pkey;
alter table public.business_settings alter column id drop default;
alter table public.business_settings drop column id;
alter table public.business_settings add primary key (business_id);
create trigger trg_business_settings_fill before insert on public.business_settings
  for each row execute function public.fill_business_id();
create policy tenant_isolation on public.business_settings as restrictive for all to authenticated
  using (business_id = public.current_business())
  with check (business_id = public.current_business() or business_id is null);

-- Gapless numbering is per business.
alter table public.document_counters add column business_id uuid references public.businesses (id) on delete cascade;
update public.document_counters set business_id = '00000000-0000-4000-9000-000000000001';
alter table public.document_counters alter column business_id set not null;
alter table public.document_counters drop constraint document_counters_pkey;
alter table public.document_counters add primary key (business_id, prefix, year);

create or replace function public.next_document_number(p_prefix text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business uuid;
  v_year int := extract(year from now())::int;
  v_value int;
begin
  v_business := public.current_business();
  if v_business is null then
    select id into v_business from businesses limit 2;
    if (select count(*) from businesses) > 1 then
      raise exception 'cannot derive business for document numbering';
    end if;
  end if;
  insert into document_counters (business_id, prefix, year, last_value)
  values (v_business, p_prefix, v_year, 1)
  on conflict (business_id, prefix, year)
  do update set last_value = document_counters.last_value + 1
  returning last_value into v_value;
  return format('%s-%s-%s', p_prefix, v_year, lpad(v_value::text, 4, '0'));
end;
$$;

-- ── RLS for the new tables ───────────────────────────────────────────────────

alter table public.businesses enable row level security;
alter table public.business_members enable row level security;

-- Definer helper reads memberships WITHOUT RLS — policies that need "my
-- businesses" use it instead of querying business_members (which would
-- recurse into its own policy).
create or replace function public.my_business_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select business_id from business_members
  where user_id = auth.uid() and status = 'active';
$$;

create policy "member select" on public.businesses for select to authenticated
  using (public.is_platform_admin() or id in (select public.my_business_ids()));
create policy "member select" on public.business_members for select to authenticated
  using (
    public.is_platform_admin()
    or user_id = auth.uid()
    or business_id in (select public.my_business_ids())
  );

grant select on public.businesses, public.business_members to authenticated;
grant select, insert, update, delete on public.businesses, public.business_members to service_role;

-- ── Onboarding RPCs ──────────────────────────────────────────────────────────

-- Anyone signed in can found a business; they become its admin and it seeds
-- its own stages, dropdown lists, and settings row.
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
  insert into business_settings (business_id, name) values (v_business, btrim(p_name));
  insert into stage_settings (business_id, stage, label, position) values
    (v_business, 'new', 'New', 0), (v_business, 'contacted', 'Contacted', 1),
    (v_business, 'quoted', 'Quoted', 2), (v_business, 'follow_up', 'Follow up', 3),
    (v_business, 'won', 'Won', 4), (v_business, 'templated', 'Templated', 5),
    (v_business, 'fabrication', 'Fabrication', 6), (v_business, 'scheduled', 'Scheduled', 7),
    (v_business, 'installed', 'Installed', 8), (v_business, 'closed', 'Closed', 9),
    (v_business, 'lost', 'Lost', 10);
  insert into option_items (business_id, list_key, value, position) values
    (v_business, 'lead_sources', 'referral', 0), (v_business, 'lead_sources', 'website', 1),
    (v_business, 'lead_sources', 'meta', 2), (v_business, 'lead_sources', 'google', 3),
    (v_business, 'lead_sources', 'repeat client', 4),
    (v_business, 'job_roles', 'Owner', 0), (v_business, 'job_roles', 'Sales', 1),
    (v_business, 'job_roles', 'Production Manager', 2), (v_business, 'job_roles', 'Installer', 3),
    (v_business, 'job_roles', 'Office Admin', 4);
  return v_business;
end;
$$;

-- A business admin adds a signed-up user by email.
create or replace function public.add_member_by_email(p_email text, p_role user_role default 'staff')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business uuid := public.current_business();
  v_user uuid;
begin
  if v_business is null then
    raise exception 'no active business';
  end if;
  if not public.is_admin() then
    raise exception 'only a business admin can add members';
  end if;
  select id into v_user from profiles where lower(email) = lower(btrim(p_email));
  if v_user is null then
    raise exception 'no account found for % — ask them to sign up first', p_email;
  end if;
  insert into business_members (business_id, user_id, role)
  values (v_business, v_user, p_role)
  on conflict (business_id, user_id) do update set role = excluded.role, status = 'active';
  update profiles set active_business_id = v_business
  where id = v_user and active_business_id is null;
end;
$$;

-- Switch workspace (members and platform admins).
create or replace function public.set_active_business(p_business uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() and not exists (
    select 1 from business_members
    where business_id = p_business and user_id = auth.uid() and status = 'active'
  ) then
    raise exception 'not a member of that business';
  end if;
  update profiles set active_business_id = p_business where id = auth.uid();
end;
$$;

grant execute on function public.register_business(text) to authenticated;
grant execute on function public.add_member_by_email(text, user_role) to authenticated;
grant execute on function public.set_active_business(uuid) to authenticated;

-- Existing dev/seed users join the default business.
insert into public.business_members (business_id, user_id, role)
select '00000000-0000-4000-9000-000000000001', id,
       case when role = 'admin' then 'admin'::user_role else 'staff'::user_role end
from public.profiles
on conflict do nothing;
update public.profiles set active_business_id = '00000000-0000-4000-9000-000000000001'
where active_business_id is null;

-- Profiles must not leak across tenants: visible only to yourself, your
-- co-members, and platform admins. (Restrictive layer on top of the
-- original permissive select policy.)
create policy tenant_isolation on public.profiles as restrictive for select to authenticated
  using (
    id = auth.uid()
    or public.is_platform_admin()
    or exists (
      select 1 from business_members theirs
      where theirs.user_id = profiles.id
        and theirs.status = 'active'
        and theirs.business_id in (select public.my_business_ids())
    )
  );
