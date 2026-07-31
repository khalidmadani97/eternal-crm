-- Slice 15 — job costing and overhead (DECISIONS 024).
--
-- One table. job_id set → a job cost (materials, subcontractor payments,
-- disposal…); job_id null → overhead (rent, insurance, software…). amount is
-- PRE-TAX; hst_amount is tracked separately because HST paid is an input
-- tax credit, not a cost — P&L math uses amount only. Receipts upload to the
-- job-files bucket and are referenced by receipt_path.
--
-- Expenses are management records, not books of record (QuickBooks remains
-- the source of truth for the CRA) — so unlike payments they are editable
-- and hard-deletable by staff.

create type public.expense_category as enum (
  'materials', 'subcontractor', 'labour', 'equipment', 'disposal',
  'permits', 'fuel', 'marketing', 'office', 'rent', 'insurance',
  'software', 'other'
);

create table public.expenses (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid references public.jobs (id) on delete set null,
  category     public.expense_category not null,
  vendor       text,
  description  text,
  amount       numeric(12, 2) not null,          -- before tax
  hst_amount   numeric(12, 2) not null default 0, -- input tax credit, not a cost
  method       public.payment_method,
  incurred_at  date not null default current_date,
  reference    text,                              -- e-transfer conf, supplier invoice #
  receipt_path text,                              -- job-files bucket
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index idx_expenses_job         on public.expenses (job_id);
create index idx_expenses_incurred_at on public.expenses (incurred_at);
create index idx_expenses_category    on public.expenses (category);

create trigger trg_expenses_updated_at
  before update on public.expenses
  for each row execute function public.set_updated_at();

alter table public.expenses enable row level security;

create policy "staff select" on public.expenses for select to authenticated using (true);
create policy "staff insert" on public.expenses for insert to authenticated with check (true);
create policy "staff update" on public.expenses for update to authenticated using (true) with check (true);
create policy "staff delete" on public.expenses for delete to authenticated using (true);

-- Explicit grants (DECISIONS 020).
grant select, insert, update, delete on public.expenses to authenticated;
grant select, insert, update, delete on public.expenses to service_role;
