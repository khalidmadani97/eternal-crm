import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { BUSINESS as FALLBACK } from '../../../lib/business'
import { useBusinessSettings } from '../../settings/api'
import { formatCurrency, formatDate, formatPhone } from '../../../lib/format'
import { lineAmount } from '../../../lib/money'
import { useInvoice } from '../api'

// Branded invoice print view (DECISIONS 021). The HST registration number
// renders on every invoice — non-negotiable.

const ESPRESSO = '#3b2a20'
const GOLD = '#b08d3f'

export function InvoicePrintPage() {
  const { id } = useParams<{ id: string }>()
  const { data: invoice, isPending, isError, error } = useInvoice(id!)

  const { data: dbBusiness } = useBusinessSettings()
  const biz = {
    name: dbBusiness?.name ?? FALLBACK.name,
    tagline: dbBusiness?.tagline ?? FALLBACK.tagline,
    phone: dbBusiness?.phone ?? FALLBACK.phone,
    email: dbBusiness?.email ?? FALLBACK.email,
    address: dbBusiness?.address ?? FALLBACK.address,
    hstNumber: dbBusiness?.hst_number ?? FALLBACK.hstNumber,
  }

  useEffect(() => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href =
      'https://fonts.googleapis.com/css2?family=Lora:wght@500;600&family=Poppins:wght@300;400;500&display=swap'
    document.head.appendChild(link)
    return () => link.remove()
  }, [])

  if (isPending) return <p className="py-12 text-center text-stone-500">Loading invoice…</p>
  if (isError) return <p className="py-12 text-center text-red-600">Could not load. {error.message}</p>

  const balance = Number(invoice.total) - Number(invoice.amount_paid)

  return (
    <div style={{ fontFamily: "'Poppins', sans-serif", color: '#2a2a2a' }} className="mx-auto max-w-3xl bg-white p-10">
      <div className="mb-2 flex justify-end gap-2 print:hidden">
        <button
          onClick={() => window.print()}
          className="rounded px-4 py-2 text-sm font-medium text-white"
          style={{ backgroundColor: ESPRESSO }}
        >
          Print / Save as PDF
        </button>
      </div>

      {invoice.status === 'draft' && (
        <p className="mb-4 rounded border px-3 py-2 text-center text-sm font-medium print:hidden" style={{ borderColor: GOLD, color: GOLD }}>
          DRAFT — not yet issued
        </p>
      )}
      {invoice.status === 'void' && (
        <p className="mb-4 rounded border border-red-300 px-3 py-2 text-center text-sm font-semibold text-red-600">
          VOID {invoice.voided_at && `— ${formatDate(invoice.voided_at)}`}
        </p>
      )}

      <header className="mb-8 flex items-start justify-between border-b-2 pb-6" style={{ borderColor: GOLD }}>
        <div>
          <h1 style={{ fontFamily: "'Lora', serif", color: ESPRESSO }} className="text-3xl font-semibold">
            {biz.name}
          </h1>
          <p className="text-sm" style={{ color: GOLD }}>
            {biz.tagline}
          </p>
          <p className="mt-2 text-xs text-stone-500">
            {biz.address} · {formatPhone(biz.phone)} · {biz.email}
          </p>
        </div>
        <div className="text-right">
          <h2 style={{ fontFamily: "'Lora', serif", color: ESPRESSO }} className="text-xl font-medium">
            Invoice
          </h2>
          <p className="text-sm font-medium">{invoice.invoice_number}</p>
          <p className="text-xs text-stone-500">Issued {formatDate(invoice.issue_date)}</p>
          {invoice.due_date && <p className="text-xs text-stone-500">Due {formatDate(invoice.due_date)}</p>}
        </div>
      </header>

      {invoice.job && (
        <section className="mb-8 grid grid-cols-2 gap-6 text-sm">
          <div>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider" style={{ color: GOLD }}>
              Bill to
            </h3>
            <p className="font-medium">{invoice.job.contact?.full_name}</p>
            {invoice.job.contact?.email && <p className="text-stone-600">{invoice.job.contact.email}</p>}
            {invoice.job.contact?.phone && (
              <p className="text-stone-600">{formatPhone(invoice.job.contact.phone)}</p>
            )}
          </div>
          <div>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider" style={{ color: GOLD }}>
              Project
            </h3>
            <p className="font-medium">{invoice.job.title}</p>
            {invoice.job.site_address && <p className="text-stone-600">{invoice.job.site_address}</p>}
            <p className="text-stone-500">{invoice.job.job_number}</p>
          </div>
        </section>
      )}

      <table className="mb-6 w-full text-sm">
        <thead>
          <tr style={{ backgroundColor: ESPRESSO, color: 'white' }}>
            <th className="px-3 py-2 text-left font-medium">Description</th>
            <th className="px-3 py-2 text-right font-medium">Qty</th>
            <th className="px-3 py-2 text-left font-medium">Unit</th>
            <th className="px-3 py-2 text-right font-medium">Unit price</th>
            <th className="px-3 py-2 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {invoice.line_items.map((item) => (
            <tr key={item.id} className="border-b border-stone-200">
              <td className="px-3 py-2">{item.description}</td>
              <td className="px-3 py-2 text-right tabular-nums">{item.quantity}</td>
              <td className="px-3 py-2">{item.unit ?? ''}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(item.unit_price)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(lineAmount(item))}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mb-10 flex justify-end">
        <dl className="w-72 space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-stone-500">Subtotal</dt>
            <dd className="tabular-nums">{formatCurrency(invoice.subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-stone-500">
              HST ({(Number(invoice.tax_rate) * 100).toFixed(2).replace(/\.?0+$/, '')}%)
            </dt>
            <dd className="tabular-nums">{formatCurrency(invoice.tax_amount)}</dd>
          </div>
          <div className="flex justify-between border-t-2 pt-2 text-base font-semibold" style={{ borderColor: GOLD, color: ESPRESSO }}>
            <dt style={{ fontFamily: "'Lora', serif" }}>Total</dt>
            <dd className="tabular-nums">{formatCurrency(invoice.total)}</dd>
          </div>
          {Number(invoice.amount_paid) !== 0 && (
            <>
              <div className="flex justify-between">
                <dt className="text-stone-500">Paid</dt>
                <dd className="tabular-nums">{formatCurrency(invoice.amount_paid)}</dd>
              </div>
              <div className="flex justify-between font-semibold">
                <dt>Balance due</dt>
                <dd className="tabular-nums">{formatCurrency(balance)}</dd>
              </div>
            </>
          )}
        </dl>
      </div>

      <footer className="border-t border-stone-200 pt-4 text-xs text-stone-500">
        <p className="font-medium">
          {biz.name} · HST # {biz.hstNumber}
        </p>
        {invoice.contract?.status === 'signed' && (
          <p className="mt-1">
            Signed contract on file{invoice.contract.signed_at ? ` (${formatDate(invoice.contract.signed_at)}` : ''}
            {invoice.contract.signer_name ? `, ${invoice.contract.signer_name})` : invoice.contract.signed_at ? ')' : ''} — governs this work.
          </p>
        )}
        <p className="mt-1">
          Payment by e-transfer to {biz.email}, cheque, or the card link on this invoice.
        </p>
      </footer>
    </div>
  )
}
