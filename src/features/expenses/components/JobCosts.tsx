import { useState } from 'react'
import { useAuth } from '../../auth/AuthProvider'
import { formatCurrency, formatDate } from '../../../lib/format'
import {
  EXPENSE_CATEGORY_LABELS,
  JOB_COST_CATEGORIES,
  receiptUrl,
  useCreateExpense,
  useDeleteExpense,
  useJobExpenses,
  useJobInvoicedRevenue,
} from '../api'
import type { ExpenseCategory, PaymentMethod } from '../api'

const METHODS: PaymentMethod[] = ['etransfer', 'cheque', 'cash', 'card', 'other']

export function JobCosts({ jobId }: { jobId: string }) {
  const { data: expenses, isPending, isError, error } = useJobExpenses(jobId)
  const { data: invoiced } = useJobInvoicedRevenue(jobId)
  const deleteExpense = useDeleteExpense()
  const [adding, setAdding] = useState(false)

  const costs = expenses?.reduce((sum, e) => sum + Number(e.amount), 0) ?? 0
  const net = (invoiced ?? 0) - costs
  const margin = invoiced && invoiced > 0 ? net / invoiced : null

  const openReceipt = async (path: string) => {
    const url = await receiptUrl(path)
    window.open(url, '_blank')
  }

  return (
    <section className="rounded-lg border border-stone-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">
          Costs &amp; profit
        </h2>
        <button
          onClick={() => setAdding(true)}
          className="rounded border border-stone-300 px-2 py-1 text-xs text-stone-700 hover:bg-stone-50"
        >
          + Expense
        </button>
      </div>

      <dl className="mb-3 grid grid-cols-4 gap-2 rounded bg-stone-50 p-3 text-center">
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-stone-400">Invoiced</dt>
          <dd className="text-sm font-semibold tabular-nums text-stone-900">
            {formatCurrency(invoiced ?? 0)}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-stone-400">Costs</dt>
          <dd className="text-sm font-semibold tabular-nums text-stone-900">
            {formatCurrency(costs)}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-stone-400">Net</dt>
          <dd
            className={`text-sm font-semibold tabular-nums ${
              net < 0 ? 'text-red-700' : 'text-emerald-700'
            }`}
          >
            {formatCurrency(net)}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-stone-400">Margin</dt>
          <dd className="text-sm font-semibold tabular-nums text-stone-900">
            {margin === null ? '—' : `${Math.round(margin * 100)}%`}
          </dd>
        </div>
      </dl>
      <p className="mb-3 text-[10px] text-stone-400">
        Pre-tax figures — HST collected/paid is excluded throughout.
      </p>

      {isPending && <p className="py-2 text-sm text-stone-500">Loading costs…</p>}
      {isError && <p className="py-2 text-sm text-red-600">Could not load costs. {error.message}</p>}
      {expenses && expenses.length === 0 && (
        <p className="py-2 text-sm text-stone-500">No expenses recorded.</p>
      )}
      <ul className="divide-y divide-stone-100">
        {expenses?.map((e) => (
          <li key={e.id} className="flex items-center gap-2 py-2 text-sm">
            <div className="min-w-0 flex-1">
              <p className="truncate text-stone-900">
                <span className="font-medium">{EXPENSE_CATEGORY_LABELS[e.category]}</span>
                {e.vendor && <span className="text-stone-500"> · {e.vendor}</span>}
              </p>
              <p className="truncate text-xs text-stone-400">
                {formatDate(e.incurred_at)}
                {e.description ? ` · ${e.description}` : ''}
                {e.reference ? ` · ${e.reference}` : ''}
              </p>
            </div>
            {e.receipt_path && (
              <button
                onClick={() => void openReceipt(e.receipt_path!)}
                className="shrink-0 text-xs text-amber-700 hover:underline"
              >
                receipt
              </button>
            )}
            <span className="shrink-0 tabular-nums font-medium">{formatCurrency(e.amount)}</span>
            <button
              onClick={() => {
                if (window.confirm('Delete this expense?')) deleteExpense.mutate(e.id)
              }}
              className="shrink-0 text-stone-300 hover:text-red-600"
              aria-label="Delete expense"
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      {adding && <ExpenseDialog jobId={jobId} onClose={() => setAdding(false)} />}
    </section>
  )
}

export function ExpenseDialog({
  jobId,
  onClose,
}: {
  /** Fixed job, or null for an overhead expense. */
  jobId: string | null
  onClose: () => void
}) {
  const { session } = useAuth()
  const createExpense = useCreateExpense()
  const [form, setForm] = useState({
    category: (jobId ? 'materials' : 'rent') as ExpenseCategory,
    vendor: '',
    description: '',
    amount: '',
    hst: '',
    method: 'etransfer' as PaymentMethod,
    incurredAt: new Date().toISOString().slice(0, 10),
    reference: '',
  })
  const [receipt, setReceipt] = useState<File | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)

  const categories = jobId ? JOB_COST_CATEGORIES : (Object.keys(EXPENSE_CATEGORY_LABELS) as ExpenseCategory[])

  const submit = () => {
    const amount = Number(form.amount)
    if (!amount || Number.isNaN(amount) || amount <= 0) {
      setValidationError('Enter a valid pre-tax amount')
      return
    }
    const hst = form.hst ? Number(form.hst) : 0
    if (Number.isNaN(hst) || hst < 0) {
      setValidationError('Enter a valid HST amount (or leave blank)')
      return
    }
    if (!session) return
    setValidationError(null)
    createExpense.mutate(
      {
        job_id: jobId,
        category: form.category,
        vendor: form.vendor.trim() || null,
        description: form.description.trim() || null,
        amount,
        hst_amount: hst,
        method: form.method,
        incurred_at: form.incurredAt,
        reference: form.reference.trim() || null,
        receipt,
        created_by: session.user.id,
      },
      { onSuccess: onClose },
    )
  }

  const inputClass =
    'w-full rounded border border-stone-300 px-3 py-2 text-sm focus:border-amber-600 focus:outline-none'

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-4 shadow-xl sm:p-6">
        <h2 className="mb-1 text-lg font-semibold text-stone-900">
          {jobId ? 'Add job expense' : 'Add overhead expense'}
        </h2>
        <p className="mb-4 text-xs text-stone-500">
          Enter the pre-tax amount; HST separately (it is an input tax credit, not a cost).
        </p>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-stone-700">Category</span>
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value as ExpenseCategory })}
              className={inputClass}
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {EXPENSE_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-stone-700">Vendor</span>
            <input
              value={form.vendor}
              onChange={(e) => setForm({ ...form, vendor: e.target.value })}
              placeholder="GTA Stone Supply"
              className={inputClass}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-stone-700">Amount (pre-tax $)</span>
            <input
              inputMode="decimal"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              className={inputClass}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-stone-700">HST paid ($)</span>
            <input
              inputMode="decimal"
              value={form.hst}
              onChange={(e) => setForm({ ...form, hst: e.target.value })}
              placeholder={form.amount ? (Number(form.amount) * 0.13).toFixed(2) : '0.00'}
              className={inputClass}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-stone-700">Paid by</span>
            <select
              value={form.method}
              onChange={(e) => setForm({ ...form, method: e.target.value as PaymentMethod })}
              className={inputClass}
            >
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-stone-700">Date</span>
            <input
              type="date"
              value={form.incurredAt}
              onChange={(e) => setForm({ ...form, incurredAt: e.target.value })}
              className={inputClass}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-stone-700">Reference</span>
            <input
              value={form.reference}
              onChange={(e) => setForm({ ...form, reference: e.target.value })}
              placeholder="e-transfer conf / invoice #"
              className={inputClass}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-stone-700">Receipt / invoice</span>
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => setReceipt(e.target.files?.[0] ?? null)}
              className="text-sm"
            />
          </label>
          <label className="col-span-2 block text-sm">
            <span className="mb-1 block font-medium text-stone-700">Description</span>
            <input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Calacatta slabs x3"
              className={inputClass}
            />
          </label>
        </div>
        {(validationError || createExpense.isError) && (
          <p className="mt-2 text-sm text-red-600">
            {validationError ?? createExpense.error?.message}
          </p>
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
            disabled={createExpense.isPending}
            className="rounded bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
          >
            {createExpense.isPending ? 'Saving…' : 'Save expense'}
          </button>
        </div>
      </div>
    </div>
  )
}
