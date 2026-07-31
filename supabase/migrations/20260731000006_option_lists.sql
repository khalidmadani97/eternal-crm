-- Slice 25 — user-editable dropdown lists (DECISIONS 028). One generic
-- table; each list is a key. The stored business columns stay plain text —
-- the list governs what the UI offers, not what the database accepts, so
-- historical values never break.

create table public.option_items (
  id         uuid primary key default gen_random_uuid(),
  list_key   text not null,
  value      text not null,
  position   int not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (list_key, value)
);

create index idx_option_items_list on public.option_items (list_key, active, position);

create trigger trg_option_items_updated_at
  before update on public.option_items
  for each row execute function public.set_updated_at();

alter table public.option_items enable row level security;
create policy "staff select" on public.option_items for select to authenticated using (true);
create policy "staff insert" on public.option_items for insert to authenticated with check (true);
create policy "staff update" on public.option_items for update to authenticated using (true) with check (true);
create policy "staff delete" on public.option_items for delete to authenticated using (true);

grant select, insert, update, delete on public.option_items to authenticated;
grant select, insert, update, delete on public.option_items to service_role;

insert into public.option_items (list_key, value, position) values
  ('lead_sources', 'referral', 0),
  ('lead_sources', 'website', 1),
  ('lead_sources', 'meta', 2),
  ('lead_sources', 'instagram', 3),
  ('lead_sources', 'google', 4),
  ('lead_sources', 'repeat client', 5),
  ('lead_sources', 'walk-in', 6);
