-- Slice 8 — invoices and payments. A bug here costs money, so everything
-- financial is enforced at the database:
--   * gapless numbering happens inside atomic server-side functions
--   * immutability once out of draft is a trigger, not UI behaviour
--   * amount_paid / status transitions are maintained by a payments trigger
--   * void is a status transition plus an activities reversal record
-- Refund payments are stored with a NEGATIVE amount (kind = 'refund') so
-- amount_paid is always a plain sum over payments.

-- ── Creation: number + insert in ONE transaction, so a failure cannot burn
-- an invoice number (job numbers may gap; invoice numbers must not).

create or replace function public.convert_quote_to_invoice(p_quote_id uuid)
returns uuid
language plpgsql
as $$
declare
  v_quote public.quotes%rowtype;
  v_invoice_id uuid;
begin
  select * into v_quote from public.quotes where id = p_quote_id;
  if not found then
    raise exception 'quote % not found', p_quote_id;
  end if;
  insert into public.invoices
    (job_id, quote_id, invoice_number, status, issue_date,
     subtotal, tax_rate, tax_amount, total, amount_paid)
  values
    (v_quote.job_id, v_quote.id, public.next_document_number('INV'), 'draft',
     current_date, v_quote.subtotal, v_quote.tax_rate, v_quote.tax_amount,
     v_quote.total, 0)
  returning id into v_invoice_id;

  insert into public.invoice_line_items
    (invoice_id, position, description, quantity, unit, unit_price, amount)
  select v_invoice_id, position, description, quantity, unit, unit_price, amount
  from public.quote_line_items
  where quote_id = p_quote_id
  order by position;

  return v_invoice_id;
end;
$$;

create or replace function public.create_invoice(p_job_id uuid, p_tax_rate numeric default 0.13)
returns uuid
language plpgsql
as $$
declare
  v_invoice_id uuid;
begin
  insert into public.invoices
    (job_id, invoice_number, status, issue_date,
     subtotal, tax_rate, tax_amount, total, amount_paid)
  values
    (p_job_id, public.next_document_number('INV'), 'draft', current_date,
     0, p_tax_rate, 0, 0, 0)
  returning id into v_invoice_id;
  return v_invoice_id;
end;
$$;

grant execute on function public.convert_quote_to_invoice(uuid) to authenticated;
grant execute on function public.create_invoice(uuid, numeric) to authenticated;

-- ── Immutability. Once status leaves draft, the financial content of the
-- invoice is frozen. Only these may still change: status (legal transitions
-- below), amount_paid / paid_at (payments trigger), voided_at, sent_at, and
-- stripe_payment_link (a convenience pointer, not financial content).

create or replace function public.invoices_immutable()
returns trigger
language plpgsql
as $$
begin
  if old.status <> 'draft' then
    if new.invoice_number is distinct from old.invoice_number
       or new.job_id      is distinct from old.job_id
       or new.quote_id    is distinct from old.quote_id
       or new.issue_date  is distinct from old.issue_date
       or new.due_date    is distinct from old.due_date
       or new.subtotal    is distinct from old.subtotal
       or new.tax_rate    is distinct from old.tax_rate
       or new.tax_amount  is distinct from old.tax_amount
       or new.total       is distinct from old.total then
      raise exception 'invoice % is % — issued invoices are immutable; corrections are a void plus a new invoice',
        old.invoice_number, old.status;
    end if;
  end if;

  if new.status is distinct from old.status then
    if not (
      (old.status = 'draft'   and new.status in ('sent', 'void'))
      or (old.status = 'sent'    and new.status in ('partial', 'paid', 'void'))
      or (old.status = 'partial' and new.status in ('sent', 'paid', 'void'))
      or (old.status = 'paid'    and new.status in ('partial', 'void'))
    ) then
      raise exception 'illegal invoice status transition % → %', old.status, new.status;
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_invoices_immutable
  before update on public.invoices
  for each row execute function public.invoices_immutable();

-- Line items freeze with their parent (delete guard exists from Slice 0;
-- this adds the UPDATE half).
create or replace function public.invoice_line_item_update_guard()
returns trigger
language plpgsql
as $$
declare
  v_status public.invoice_status;
begin
  select status into v_status from public.invoices where id = old.invoice_id;
  if v_status <> 'draft' then
    raise exception 'line items can only be edited while the invoice is draft';
  end if;
  return new;
end;
$$;

create trigger trg_invoice_line_items_update_draft_only
  before update on public.invoice_line_items
  for each row execute function public.invoice_line_item_update_guard();

-- ── Payments maintain the invoice. Fires for every role, including the
-- service role writing Stripe webhook payments.

create or replace function public.apply_payment()
returns trigger
language plpgsql
as $$
begin
  -- OLD is unassigned on INSERT — branch on TG_OP, never coalesce across it.
  if tg_op = 'UPDATE'
     and old.invoice_id is not null
     and old.invoice_id is distinct from new.invoice_id then
    perform public.recompute_invoice_paid(old.invoice_id); -- payment moved away
  end if;
  if new.invoice_id is not null then
    perform public.recompute_invoice_paid(new.invoice_id);
  end if;
  return new;
end;
$$;

create or replace function public.recompute_invoice_paid(p_invoice_id uuid)
returns void
language plpgsql
as $$
declare
  v_paid numeric(12, 2);
  v_total numeric(12, 2);
  v_status public.invoice_status;
begin
  select coalesce(sum(amount), 0) into v_paid
  from public.payments where invoice_id = p_invoice_id;

  select total, status into v_total, v_status
  from public.invoices where id = p_invoice_id;

  update public.invoices
  set amount_paid = v_paid,
      status = case
        when v_status in ('sent', 'partial', 'paid') then
          case
            when v_paid >= v_total and v_total > 0 then 'paid'::public.invoice_status
            when v_paid > 0 then 'partial'::public.invoice_status
            else 'sent'::public.invoice_status
          end
        else v_status
      end,
      paid_at = case
        when v_paid >= v_total and v_total > 0 then coalesce(paid_at, now())
        else null
      end
  where id = p_invoice_id;
end;
$$;

create trigger trg_payments_apply
  after insert or update on public.payments
  for each row execute function public.apply_payment();

-- ── Void: legal transition plus a reversal record on the timeline. Never a
-- delete — the delete matrix already denies DELETE on invoices permanently.

create or replace function public.void_invoice(p_invoice_id uuid, p_reason text)
returns void
language plpgsql
as $$
declare
  v_invoice public.invoices%rowtype;
begin
  select * into v_invoice from public.invoices where id = p_invoice_id;
  if not found then
    raise exception 'invoice % not found', p_invoice_id;
  end if;
  if v_invoice.status = 'void' then
    raise exception 'invoice % is already void', v_invoice.invoice_number;
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'a void reason is required';
  end if;

  update public.invoices
  set status = 'void', voided_at = now()
  where id = p_invoice_id;

  insert into public.activities (job_id, kind, body, meta, user_id)
  values (
    v_invoice.job_id,
    'system',
    format('Invoice %s voided — %s', v_invoice.invoice_number, btrim(p_reason)),
    jsonb_build_object('invoice_id', p_invoice_id, 'reason', btrim(p_reason),
                       'total', v_invoice.total, 'event', 'invoice_void'),
    auth.uid()
  );
end;
$$;

grant execute on function public.void_invoice(uuid, text) to authenticated;
