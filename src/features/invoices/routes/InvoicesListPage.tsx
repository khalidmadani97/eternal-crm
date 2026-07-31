import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useJobs } from '../../jobs/api'
import { formatCurrency, formatDate } from '../../../lib/format'
import { invoicesToCsv, useCreateInvoice, useInvoices } from '../api'
import type { Invoice, InvoiceStatus } from '../api'
import { RecordPaymentDialog } from '../components/RecordPaymentDialog'
import { formatCurrency as fc } from '../../../lib/format'

export const INVOICE_STATUS_BADGES: Record<InvoiceStatus, string> = {
  draft: 'bg-stone-200 text-stone-700',
  sent: 'bg-blue-100 text-blue-800',
  partial: 'bg-amber-100 text-amber-800',
  paid: 'bg-emerald-100 text-emerald-800',
  void: 'bg-red-100 text-red-800',
}

function isOverdue(inv: {
  status: InvoiceStatus
  due_date: string | null
  total: number
  amount_paid: number
}): boolean {
  return (
    (inv.status === 'sent' || inv.status === 'partial') &&
    !!inv.due_date &&
    inv.due_date < new Date().toISOString().slice(0, 10) &&
    Number(inv.total) - Number(inv.amount_paid) > 0
  )
}

export function InvoicesListPage() {
  const { data: invoices, isPending, isError, error, refetch } = useInvoices()
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | 'all'>('all')
  const [showNew, setShowNew] = useState(false)
  const [search, setSearch] = useState('')
  const [payingInvoice, setPayingInvoice] = useState<Invoice | null>(null)

  const balance = (inv: Invoice) => Number(inv.total) - Number(inv.amount_paid)
  const thisMonth = new Date().toISOString().slice(0, 7)
  const stats = {
    outstanding: (invoices ?? [])
      .filter((i) => i.status === 'sent' || i.status === 'partial')
      .reduce((s, i) => s + balance(i), 0),
    overdue: (invoices ?? []).filter(isOverdue).reduce((s, i) => s + balance(i), 0),
    collected: (invoices ?? [])
      .flatMap((i) => i.payments)
      .filter((p) => p.received_at.startsWith(thisMonth))
      .reduce((s, p) => s + Number(p.amount), 0),
    drafts: (invoices ?? []).filter((i) => i.status === 'draft').length,
  }

  const visible = invoices?.filter((inv) => {
    if (statusFilter !== 'all' && inv.status !== statusFilter) return false
    const term = search.trim().toLowerCase()
    if (!term) return true
    return `${inv.invoice_number} ${inv.job?.contact?.full_name ?? ''} ${inv.job?.job_number ?? ''}`
      .toLowerCase()
      .includes(term)
  })

  const exportCsv = () => {
    if (!invoices) return
    const blob = new Blob([invoicesToCsv(invoices)], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `invoices-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold text-stone-900">Invoices</h1>
        <input
          placeholder="Search invoice #, client…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-56 rounded border border-stone-300 bg-white px-3 py-1.5 text-sm focus:border-amber-600 focus:outline-none"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as InvoiceStatus | 'all')}
          className="rounded border border-stone-300 bg-white px-2 py-1.5 text-sm"
        >
          <option value="all">All statuses</option>
          {(['draft', 'sent', 'partial', 'paid', 'void'] as InvoiceStatus[]).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <div className="ml-auto flex gap-2">
          <button
            onClick={exportCsv}
            disabled={!invoices?.length}
            className="rounded border border-stone-300 px-3 py-2 text-sm text-stone-700 hover:bg-stone-50 disabled:opacity-50"
          >
            Export CSV
          </button>
          <button
            onClick={() => setShowNew(true)}
            className="rounded bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800"
          >
            New invoice
          </button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Outstanding" value={fc(stats.outstanding)} />
        <StatCard label="Overdue" value={fc(stats.overdue)} alarm={stats.overdue > 0} />
        <StatCard label="Collected this month" value={fc(stats.collected)} good />
        <StatCard label="Drafts" value={String(stats.drafts)} />
      </div>

      {isPending && <p className="py-12 text-center text-stone-500">Loading invoices…</p>}
      {isError && (
        <div className="py-12 text-center">
          <p className="mb-2 text-red-600">Could not load invoices. {error.message}</p>
          <button
            onClick={() => void refetch()}
            className="rounded border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-50"
          >
            Retry
          </button>
        </div>
      )}
      {visible && visible.length === 0 && (
        <p className="py-12 text-center text-stone-500">
          {invoices && invoices.length === 0 ? 'No invoices yet.' : 'No invoices match the filter.'}
        </p>
      )}

      {visible && visible.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500">
                <th className="px-4 py-3">Invoice #</th>
                <th className="px-4 py-3">Job</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Issued</th>
                <th className="px-4 py-3">Due</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-right">Paid</th>
                <th className="px-4 py-3 text-right">Balance</th>
                <th className="px-2 py-3" />
              </tr>
            </thead>
            <tbody>
              {visible.map((inv) => (
                <tr key={inv.id} className="border-b border-stone-100 last:border-0 hover:bg-stone-50">
                  <td className="px-4 py-3 font-medium">
                    <Link to={`/invoices/${inv.id}`} className="text-stone-900 hover:text-amber-700 hover:underline">
                      {inv.invoice_number}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {inv.job && (
                      <Link to={`/jobs/${inv.job.id}`} className="text-amber-700 hover:underline">
                        {inv.job.job_number}
                      </Link>
                    )}
                  </td>
                  <td className="px-4 py-3">{inv.job?.contact?.full_name ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${INVOICE_STATUS_BADGES[inv.status]}`}>
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">{formatDate(inv.issue_date)}</td>
                  <td className="px-4 py-3">
                    {formatDate(inv.due_date)}
                    {isOverdue(inv) && (
                      <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700">
                        overdue
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(inv.total)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(inv.amount_paid)}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium">
                    {formatCurrency(Number(inv.total) - Number(inv.amount_paid))}
                  </td>
                  <td className="px-2 py-3 text-right">
                    {(inv.status === 'sent' || inv.status === 'partial') && (
                      <button
                        onClick={() => setPayingInvoice(inv)}
                        className="rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
                      >
                        + Payment
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showNew && <NewInvoiceDialog onClose={() => setShowNew(false)} />}
      {payingInvoice && (
        <RecordPaymentDialog invoice={payingInvoice} onClose={() => setPayingInvoice(null)} />
      )}
    </div>
  )
}

function NewInvoiceDialog({ onClose }: { onClose: () => void }) {
  const { data: jobs } = useJobs()
  const createInvoice = useCreateInvoice()
  const navigate = useNavigate()
  const [jobId, setJobId] = useState('')

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-stone-900">New invoice</h2>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-stone-700">Job</span>
          <select
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
            className="w-full rounded border border-stone-300 px-3 py-2 text-sm focus:border-amber-600 focus:outline-none"
          >
            <option value="">Pick a job…</option>
            {jobs?.map((j) => (
              <option key={j.id} value={j.id}>
                {j.job_number} — {j.title}
              </option>
            ))}
          </select>
        </label>
        {createInvoice.isError && (
          <p className="mt-2 text-sm text-red-600">{createInvoice.error.message}</p>
        )}
        <div className="mt-4 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded border border-stone-300 px-4 py-2 text-sm text-stone-700 hover:bg-stone-50"
          >
            Cancel
          </button>
          <button
            onClick={() =>
              createInvoice.mutate(jobId, {
                onSuccess: (id) => void navigate(`/invoices/${id}`),
              })
            }
            disabled={!jobId || createInvoice.isPending}
            className="rounded bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
          >
            {createInvoice.isPending ? 'Creating…' : 'Create draft'}
          </button>
        </div>
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  alarm,
  good,
}: {
  label: string
  value: string
  alarm?: boolean
  good?: boolean
}) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-400">{label}</p>
      <p
        className={`text-lg font-semibold tabular-nums ${
          alarm ? 'text-red-700' : good ? 'text-emerald-700' : 'text-stone-900'
        }`}
      >
        {value}
      </p>
    </div>
  )
}
