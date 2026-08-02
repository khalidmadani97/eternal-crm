-- Slice 43 — invoices can reference the job's contract. Metadata, not
-- financial content: deliberately NOT in the immutability whitelist check,
-- so a contract can be attached to an already-issued invoice (like
-- stripe_payment_link).
alter table public.invoices
  add column contract_id uuid references public.contracts (id) on delete set null;
create index idx_invoices_contract on public.invoices (contract_id);
