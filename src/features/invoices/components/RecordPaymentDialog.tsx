import { useState } from 'react'
import { formatCurrency } from '../../../lib/format'
import { PAYMENT_KINDS, PAYMENT_METHODS, useRecordPayment } from '../api'
import type { Invoice, PaymentKind, PaymentMethod } from '../api'

/** Record a payment straight from the invoices list (Slice 26). */
export function RecordPaymentDialog({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  const recordPayment = useRecordPayment()
  const balance = Number(invoice.total) - Number(invoice.amount_paid)
  const [form, setForm] = useState({
    kind: 'progress' as PaymentKind,
    method: 'etransfer' as PaymentMethod,
    amount: balance > 0 ? balance.toFixed(2) : '',
    receivedAt: new Date().toISOString().slice(0, 10),
    reference: '',
  })

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
      { onSuccess: onClose },
    )
  }

  const inputClass =
    'w-full rounded border border-stone-300 px-3 py-2 text-sm focus:border-amber-600 focus:outline-none'

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
        <h2 className="mb-1 text-lg font-semibold text-stone-900">
          Payment — {invoice.invoice_number}
        </h2>
        <p className="mb-4 text-sm text-stone-500">Balance {formatCurrency(balance)}</p>
        <div className="grid grid-cols-2 gap-3">
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
            inputMode="decimal"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            placeholder="Amount"
            className={inputClass}
          />
          <input
            type="date"
            value={form.receivedAt}
            onChange={(e) => setForm({ ...form, receivedAt: e.target.value })}
            className={inputClass}
          />
          <input
            value={form.reference}
            onChange={(e) => setForm({ ...form, reference: e.target.value })}
            placeholder="Reference (e-transfer #, cheque #)"
            className={`${inputClass} col-span-2`}
          />
        </div>
        {recordPayment.isError && (
          <p className="mt-2 text-sm text-red-600">{recordPayment.error.message}</p>
        )}
        <div className="mt-4 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded border border-stone-300 px-4 py-2 text-sm text-stone-700 hover:bg-stone-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={recordPayment.isPending || !form.amount}
            className="rounded bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
          >
            {recordPayment.isPending ? 'Recording…' : 'Record'}
          </button>
        </div>
      </div>
    </div>
  )
}
