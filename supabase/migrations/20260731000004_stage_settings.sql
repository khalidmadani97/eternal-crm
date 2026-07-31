-- Slice 21 — customizable pipeline stages, the simple way. The enum keys
-- stay fixed (triggers, won/lost stamping, and reporting depend on them);
-- what staff customize is presentation: label, column order, and visibility.
-- Hidden stages still show on the board while they contain jobs.

create table public.stage_settings (
  stage      public.job_stage primary key,
  label      text not null,
  position   int not null,
  hidden     boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_stage_settings_updated_at
  before update on public.stage_settings
  for each row execute function public.set_updated_at();

insert into public.stage_settings (stage, label, position) values
  ('new',         'New',         0),
  ('contacted',   'Contacted',   1),
  ('quoted',      'Quoted',      2),
  ('follow_up',   'Follow up',   3),
  ('won',         'Won',         4),
  ('templated',   'Templated',   5),
  ('fabrication', 'Fabrication', 6),
  ('scheduled',   'Scheduled',   7),
  ('installed',   'Installed',   8),
  ('closed',      'Closed',      9),
  ('lost',        'Lost',        10);

alter table public.stage_settings enable row level security;
create policy "staff select" on public.stage_settings for select to authenticated using (true);
create policy "staff update" on public.stage_settings for update to authenticated using (true) with check (true);

-- No insert/delete for clients: the row set mirrors the enum; new stages
-- arrive by migration (enum value + settings row together).
grant select, update on public.stage_settings to authenticated;
grant select, insert, update, delete on public.stage_settings to service_role;
