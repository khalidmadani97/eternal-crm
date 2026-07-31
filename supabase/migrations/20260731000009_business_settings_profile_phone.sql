-- Slice 31 — business identity in the database + employee phone numbers.
--
-- business_settings is a single row (id = true enforces it). It replaces
-- the hardcoded constants for everything client-rendered: print headers,
-- the HST number on invoices, contact-log defaults, and the default tax
-- rate stamped on new documents. Historical documents keep their stored
-- rates (non-negotiable).

create table public.business_settings (
  id               boolean primary key default true check (id),
  name             text not null default 'Eternal Interiors',
  tagline          text,
  phone            text check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$'),
  email            text,
  address          text,
  hst_number       text,
  default_tax_rate numeric(5, 4) not null default 0.13,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create trigger trg_business_settings_updated_at
  before update on public.business_settings
  for each row execute function public.set_updated_at();

insert into public.business_settings (id, name, tagline, phone, email, address, hst_number)
values (true, 'Eternal Interiors', 'Custom stone & millwork', '+14165550000',
        'hello@eternalinteriors.ca', 'Toronto, Ontario', null);

alter table public.business_settings enable row level security;
create policy "staff select" on public.business_settings for select to authenticated using (true);
create policy "admin update" on public.business_settings
  for update to authenticated
  using (exists (select 1 from public.profiles me where me.id = auth.uid() and me.role = 'admin'))
  with check (true);

grant select, update on public.business_settings to authenticated;
grant select, insert, update, delete on public.business_settings to service_role;

-- Employee direct number — shown on the profile card and used as the
-- default "from" when logging a call made from a personal cell.
alter table public.profiles
  add column phone text check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$');
