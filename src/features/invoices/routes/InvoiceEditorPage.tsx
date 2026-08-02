import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { formatCurrency, formatDate } from '../../../lib/format'
import { documentTotals, lineAmount } from '../../../lib/money'
import {
  PAYMENT_KINDS,
  PAYMENT_METHODS,
  useCreatePaymentLink,
  useInvoice,
  useRecordPayment,
  useSaveInvoiceLines,
  useSendInvoice,
  useVoidInvoice,
} from '../api'
import type { Invoice, InvoiceLineItem, PaymentKind, PaymentMethod } from '../api'
import { InvoiceContract } from '../components/InvoiceContract'
import { INVOICE_STATUS_BADGES } from './InvoicesListPage'

export function InvoiceEditorPage() {
  const { id } = useParams<{ id: string }>()
  const { data: invoice, isPending, isError, error, refetch } = useInvoice(id!)

  if (isPending) return <p className="py-12 text-center text-stone-500">Loading invoice…</p>
  if (isError)
    return (
      <div className="py-12 text-center">
        <p className="mb-2 text-red-600">Could not load the invoice. {error.message}</p>
        <button
          onClick={() => void refetch()}
          className="rounded border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-50"
        >
          Retry
        </button>
      </div>
    )

  return (
    <div>
      <InvoiceHeader invoice={invoice} />
      {invoice.status === 'draft' ? <DraftEditor invoice={invoice} /> : <IssuedView invoice={invoice} />}
    </div>
  )
}

function InvoiceHeader({ invoice }: { invoice: Invoice }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Link to="/invoices" className="text-sm text-stone-500 hover:text-stone-800">
        ← Invoices
      </Link>
      <h1 className="text-xl font-semibold text-stone-900">{invoice.invoice_number}</h1>
      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${INVOICE_STATUS_BADGES[invoice.status]}`}>
        {invoice.status}
      </span>
      {invoice.job && (
        <Link to={`/jobs/${invoice.job.id}`} className="text-sm text-amber-700 hover:underline">
          {invoice.job.job_number} — {invoice.job.title}
        </Link>
      )}
      <Link
        to={`/invoices/${invoice.id}/print`}
        className="ml-auto rounded border border-stone-300 px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-50"
      >
        View PDF
      </Link>
    </div>
  )
}

function DraftEditor({ invoice }: { invoice: Invoice }) {
  const saveLines = useSaveInvoiceLines()
  const sendInvoice = useSendInvoice()
  const [items, setItems] = useState<InvoiceLineItem[]>(invoice.line_items)
  const [dueDate, setDueDate] = useState(invoice.due_date ?? '')
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    setItems(invoice.line_items)
    setDueDate(invoice.due_date ?? '')
    setDirty(false)
  }, [invoice])

  const totals = documentTotals(items, invoice.tax_rate)
  const inputClass =
    'w-full rounded border border-stone-300 px-2 py-1.5 text-sm focus:border-amber-600 focus:outline-none'

  const setItem = (index: number, patch: Partial<InvoiceLineItem>) => {
    setItems(items.map((item, i) => (i === index ? { ...item, ...patch } : item)))
    setDirty(true)
  }

  return (
    <div className="mt-4">
      <div className="rounded-lg border border-stone-200 bg-white p-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500">
              <th className="py-2 pr-2">Description</th>
              <th className="w-20 py-2 pr-2">Qty</th>
              <th className="w-20 py-2 pr-2">Unit</th>
              <th className="w-28 py-2 pr-2">Unit price</th>
              <th className="w-28 py-2 pr-2 text-right">Amount</th>
              <th className="w-8 py-2" />
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={i} className="border-b border-stone-100 last:border-0">
                <td className="py-1.5 pr-2">
                  <input
                    value={item.description}
                    onChange={(e) => setItem(i, { description: e.target.value })}
                    className={inputClass}
                  />
                </td>
                <td className="py-1.5 pr-2">
                  <input
                    inputMode="decimal"
                    value={item.quantity}
                    onChange={(e) => setItem(i, { quantity: Number(e.target.value) || 0 })}
                    className={inputClass}
                  />
                </td>
                <td className="py-1.5 pr-2">
                  <input
                    value={item.unit ?? ''}
                    onChange={(e) => setItem(i, { unit: e.target.value || null })}
                    className={inputClass}
                  />
                </td>
                <td className="py-1.5 pr-2">
                  <input
                    inputMode="decimal"
                    value={item.unit_price}
                    onChange={(e) => setItem(i, { unit_price: Number(e.target.value) || 0 })}
                    className={inputClass}
                  />
                </td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{formatCurrency(lineAmount(item))}</td>
                <td className="py-1.5 text-right">
                  <button
                    onClick={() => {
                      setItems(items.filter((_, idx) => idx !== i))
                      setDirty(true)
                    }}
                    className="text-stone-300 hover:text-red-600"
                    aria-label="Remove line"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button
          onClick={() => {
            setItems([...items, { position: items.length, description: '', quantity: 1, unit: 'ea', unit_price: 0 }])
            setDirty(true)
          }}
          className="mt-2 rounded border border-dashed border-stone-300 px-3 py-1.5 text-sm text-stone-500 hover:border-stone-400 hover:text-stone-700"
        >
          + Add line
        </button>

        <div className="mt-4 flex items-end justify-between">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-stone-700">Due date</span>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => {
                setDueDate(e.target.value)
                setDirty(true)
              }}
              className="rounded border border-stone-300 px-2 py-1.5 text-sm"
            />
          </label>
          <Totals subtotal={totals.subtotal} taxRate={invoice.tax_rate} taxAmount={totals.tax_amount} total={totals.total} />
        </div>
        <div className="mt-3 border-t border-stone-100 pt-3">
          <InvoiceContract invoice={invoice} />
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={() =>
            saveLines.mutate(
              { invoice, items: items.filter((i) => i.description.trim()), dueDate: dueDate || null },
              { onSuccess: () => setDirty(false) },
            )
          }
          disabled={saveLines.isPending || !dirty}
          className="rounded bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
        >
          {saveLines.isPending ? 'Saving…' : dirty ? 'Save draft' : 'Saved'}
        </button>
        <button
          onClick={() => {
            if (window.confirm('Issue this invoice? It becomes immutable once sent.'))
              sendInvoice.mutate(invoice)
          }}
          disabled={sendInvoice.isPending || dirty || items.length === 0}
          title={dirty ? 'Save first' : undefined}
          className="rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {sendInvoice.isPending ? 'Issuing…' : 'Issue invoice'}
        </button>
        {(saveLines.isError || sendInvoice.isError) && (
          <span className="text-sm text-red-600">{saveLines.error?.message ?? sendInvoice.error?.message}</span>
        )}
      </div>
    </div>
  )
}

function IssuedView({ invoice }: { invoice: Invoice }) {
  const voidInvoice = useVoidInvoice()
  const paymentLink = useCreatePaymentLink()
  const balance = Number(invoice.total) - Number(invoice.amount_paid)

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_22rem]">
      <div className="rounded-lg border border-stone-200 bg-white p-4">
        <p className="mb-3 text-sm text-stone-500">
          Issued {formatDate(invoice.issue_date)}
          {invoice.due_date && ` · due ${formatDate(invoice.due_date)}`} — contents are immutable.
        </p>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500">
              <th className="py-2 pr-2">Description</th>
              <th className="w-20 py-2 pr-2 text-right">Qty</th>
              <th className="w-20 py-2 pr-2">Unit</th>
              <th className="w-28 py-2 pr-2 text-right">Unit price</th>
              <th className="w-28 py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.line_items.map((item) => (
              <tr key={item.id} className="border-b border-stone-100 last:border-0">
                <td className="py-2 pr-2">{item.description}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{item.quantity}</td>
                <td className="py-2 pr-2">{item.unit ?? ''}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{formatCurrency(item.unit_price)}</td>
                <td className="py-2 text-right tabular-nums">{formatCurrency(lineAmount(item))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 flex justify-end">
          <Totals
            subtotal={invoice.subtotal}
            taxRate={invoice.tax_rate}
            taxAmount={invoice.tax_amount}
            total={invoice.total}
            amountPaid={invoice.amount_paid}
          />
        </div>
        <div className="mt-4 border-t border-stone-100 pt-3">
          <InvoiceContract invoice={invoice} />
        </div>
        {invoice.status !== 'void' && (
          <div className="mt-4 flex items-center gap-3 border-t border-stone-100 pt-3">
            <button
              onClick={() => {
                const reason = window.prompt('Void reason (required — this is recorded):')
                if (reason?.trim()) voidInvoice.mutate({ id: invoice.id, reason: reason.trim() })
              }}
              disabled={voidInvoice.isPending}
              className="rounded border border-red-200 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              Void invoice
            </button>
            {balance > 0 && (
              <button
                onClick={() => paymentLink.mutate(invoice.id)}
                disabled={paymentLink.isPending}
                className="rounded border border-stone-300 px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-50 disabled:opacity-50"
              >
                {paymentLink.isPending ? 'Creating link…' : 'Stripe payment link'}
              </button>
            )}
            {invoice.stripe_payment_link && (
              <a
                href={invoice.stripe_payment_link}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-amber-700 hover:underline"
              >
                Open payment link
              </a>
            )}
            {voidInvoice.isError && <span className="text-sm text-red-600">{voidInvoice.error.message}</span>}
            {paymentLink.isError && <span className="text-sm text-red-600">{paymentLink.error.message}</span>}
          </div>
        )}
      </div>

      <PaymentsPanel invoice={invoice} balance={balance} />
    </div>
  )
}

function Totals({
  subtotal,
  taxRate,
  taxAmount,
  total,
  amountPaid,
}: {
  subtotal: number
  taxRate: number
  taxAmount: number
  total: number
  amountPaid?: number
}) {
  return (
    <dl className="w-64 space-y-1 text-sm">
      <div className="flex justify-between">
        <dt className="text-stone-500">Subtotal</dt>
        <dd className="tabular-nums">{formatCurrency(subtotal)}</dd>
      </div>
      <div className="flex justify-between">
        <dt className="text-stone-500">HST ({(Number(taxRate) * 100).toFixed(2).replace(/\.?0+$/, '')}%)</dt>
        <dd className="tabular-nums">{formatCurrency(taxAmount)}</dd>
      </div>
      <div className="flex justify-between border-t border-stone-200 pt-1 font-semibold">
        <dt>Total</dt>
        <dd className="tabular-nums">{formatCurrency(total)}</dd>
      </div>
      {amountPaid !== undefined && (
        <>
          <div className="flex justify-between">
            <dt className="text-stone-500">Paid</dt>
            <dd className="tabular-nums">{formatCurrency(amountPaid)}</dd>
          </div>
          <div className="flex justify-between font-semibold text-amber-800">
            <dt>Balance</dt>
            <dd className="tabular-nums">{formatCurrency(Number(total) - Number(amountPaid))}</dd>
          </div>
        </>
      )}
    </dl>
  )
}

function PaymentsPanel({ invoice, balance }: { invoice: Invoice; balance: number }) {
  const recordPayment = useRecordPayment()
  const [form, setForm] = useState({
    kind: 'deposit' as PaymentKind,
    method: 'etransfer' as PaymentMethod,
    amount: '',
    receivedAt: new Date().toISOString().slice(0, 10),
    reference: '',
  })
  const inputClass =
    'w-full rounded border border-stone-300 px-2 py-1.5 text-sm focus:border-amber-600 focus:outline-none'

  const submit = () => {
    const amount = Number(form.amount)
    if (!amount || Number.isNaN(amount) || amount <= 0) return
    recordPayment.mutate(
      {
        invoice,
        kind: form.kind,
        method: form.method,
        amount,
        receivedAt: form.receivedAt,
        reference: form.reference.trim() || null,
      },
      { onSuccess: () => setForm({ ...form, amount: '', reference: '' }) },
    )
  }

  return (
    <section className="rounded-lg border border-stone-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">Payments</h2>
      {invoice.payments.length === 0 && (
        <p className="mb-3 text-sm text-stone-500">No payments recorded.</p>
      )}
      <ul className="mb-4 space-y-2">
        {invoice.payments.map((p) => (
          <li key={p.id} className="flex items-center justify-between text-sm">
            <span>
              <span className="font-medium">{formatCurrency(p.amount)}</span>{' '}
              <span className="text-stone-500">
                {p.kind} · {p.method}
                {p.reference ? ` · ${p.reference}` : ''}
              </span>
            </span>
            <span className="text-xs text-stone-400">{formatDate(p.received_at)}</span>
          </li>
        ))}
      </ul>

      {invoice.status !== 'void' && (
        <div className="space-y-2 border-t border-stone-100 pt-3">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-400">
            Record payment {balance > 0 && `(balance ${formatCurrency(balance)})`}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <select
              value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value as PaymentKind })}
              className={inputClass}
            >
              {PAYMENT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            <select
              value={form.method}
              onChange={(e) => setForm({ ...form, method: e.target.value as PaymentMethod })}
              className={inputClass}
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <input
              placeholder="Amount"
              inputMode="decimal"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              className={inputClass}
            />
            <input
              type="date"
              value={form.receivedAt}
              onChange={(e) => setForm({ ...form, receivedAt: e.target.value })}
              className={inputClass}
            />
            <input
              placeholder="Reference (e-transfer #, cheque #)"
              value={form.reference}
              onChange={(e) => setForm({ ...form, reference: e.target.value })}
              className={`${inputClass} col-span-2`}
            />
          </div>
          <button
            onClick={submit}
            disabled={recordPayment.isPending || !form.amount}
            className="w-full rounded bg-stone-900 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
          >
            {recordPayment.isPending ? 'Recording…' : 'Record payment'}
          </button>
          {recordPayment.isError && (
            <p className="text-sm text-red-600">{recordPayment.error.message}</p>
          )}
        </div>
      )}
    </section>
  )
}
