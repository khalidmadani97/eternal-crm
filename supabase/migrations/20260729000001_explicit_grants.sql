-- Slice 1 — explicit table privileges (DECISIONS 020).
--
-- The Slice 0 migration assumed Supabase's default privileges give
-- `authenticated` full DML on new tables. On the current stack they do not:
-- tables created in migrations carried no SELECT/INSERT/UPDATE/DELETE for
-- anon, authenticated, or service_role, so every request hit
-- "permission denied" before RLS was even consulted.
--
-- Grants are now explicit and mirror the delete-policy matrix in
-- docs/SCHEMA.md. Grants are the coarse layer; RLS policies remain the fine
-- layer. anon gets nothing, ever (DECISIONS 008).

-- service_role: full DML everywhere. The append-only / delete-guard triggers
-- fire for the service role too — they, not grants, are the real enforcement
-- for immutable tables.
grant select, insert, update, delete on all tables in schema public to service_role;

-- authenticated: read everything except document_counters (touched only
-- inside the security-definer numbering function).
grant select on
  public.profiles, public.companies, public.contacts, public.jobs,
  public.activities, public.appointments, public.quotes,
  public.quote_line_items, public.invoices, public.invoice_line_items,
  public.payments, public.contracts, public.tasks, public.files,
  public.calls, public.messages, public.consent_records, public.inbound_leads
to authenticated;

-- Operational tables: insert + update.
grant insert, update on
  public.companies, public.contacts, public.jobs, public.appointments,
  public.quotes, public.quote_line_items, public.invoices,
  public.invoice_line_items, public.payments, public.contracts,
  public.tasks, public.files, public.inbound_leads
to authenticated;

-- profiles: update own row only (RLS narrows to auth.uid()).
grant update on public.profiles to authenticated;

-- Append-only tables: insert only.
grant insert on public.activities, public.consent_records to authenticated;

-- calls: staff may edit notes and nothing else (column-level grant).
grant update (notes) on public.calls to authenticated;

-- Hard delete only where the matrix allows it; line items are further
-- restricted to draft parents by the section 6 guard triggers.
grant delete on
  public.tasks, public.appointments,
  public.quote_line_items, public.invoice_line_items
to authenticated;
