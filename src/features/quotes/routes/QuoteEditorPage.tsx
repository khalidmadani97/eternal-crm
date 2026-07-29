import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useUpdateJob } from '../../jobs/api'
import type { JobStage } from '../../jobs/api'
import { formatCurrency, formatDate } from '../../../lib/format'
import { documentTotals, lineAmount } from '../../../lib/money'
import { useQuote, useSaveQuoteLines, useSendQuote, useSetQuoteStatus } from '../api'
import type { Quote, QuoteLineItem } from '../api'

const STATUS_BADGES: Record<string, string> = {
  draft: 'bg-stone-200 text-stone-700',
  sent: 'bg-blue-100 text-blue-800',
  accepted: 'bg-emerald-100 text-emerald-800',
  declined: 'bg-red-100 text-red-800',
  expired: 'bg-amber-100 text-amber-800',
}

export function QuoteEditorPage() {
  const { id } = useParams<{ id: string }>()
  const { data: quote, isPending, isError, error, refetch } = useQuote(id!)

  if (isPending) return <p className="py-12 text-center text-stone-500">Loading quote…</p>
  if (isError)
    return (
      <div className="py-12 text-center">
        <p className="mb-2 text-red-600">Could not load the quote. {error.message}</p>
        <button
          onClick={() => void refetch()}
          className="rounded border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-50"
        >
          Retry
        </button>
      </div>
    )

  return quote.status === 'draft' ? <DraftEditor quote={quote} /> : <SentQuoteView quote={quote} />
}

function QuoteHeader({ quote }: { quote: Quote }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {quote.job && (
        <Link to={`/jobs/${quote.job.id}`} className="text-sm text-stone-500 hover:text-stone-800">
          ← {quote.job.job_number}
        </Link>
      )}
      <h1 className="text-xl font-semibold text-stone-900">{quote.quote_number}</h1>
      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGES[quote.status]}`}>
        {quote.status}
      </span>
      <Link
        to={`/quotes/${quote.id}/print`}
        className="ml-auto rounded border border-stone-300 px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-50"
      >
        View PDF
      </Link>
    </div>
  )
}

function DraftEditor({ quote }: { quote: Quote }) {
  const saveLines = useSaveQuoteLines()
  const sendQuote = useSendQuote()
  const [items, setItems] = useState<QuoteLineItem[]>(quote.line_items)
  const [validUntil, setValidUntil] = useState(quote.valid_until ?? '')
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    setItems(quote.line_items)
    setValidUntil(quote.valid_until ?? '')
    setDirty(false)
  }, [quote])

  const totals = documentTotals(items, quote.tax_rate)

  const setItem = (index: number, patch: Partial<QuoteLineItem>) => {
    setItems(items.map((item, i) => (i === index ? { ...item, ...patch } : item)))
    setDirty(true)
  }
  const addItem = () => {
    setItems([
      ...items,
      { position: items.length, description: '', quantity: 1, unit: 'ea', unit_price: 0 },
    ])
    setDirty(true)
  }
  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index))
    setDirty(true)
  }

  const save = () => {
    const cleaned = items.filter((item) => item.description.trim())
    saveLines.mutate(
      { quote, items: cleaned, validUntil: validUntil || null },
      { onSuccess: () => setDirty(false) },
    )
  }

  const send = () => {
    if (dirty || items.length === 0) return
    if (window.confirm('Send this quote? Line items freeze once sent.')) sendQuote.mutate(quote)
  }

  const inputClass =
    'w-full rounded border border-stone-300 px-2 py-1.5 text-sm focus:border-amber-600 focus:outline-none'

  return (
    <div>
      <QuoteHeader quote={quote} />
      <div className="mt-4 rounded-lg border border-stone-200 bg-white p-4">
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
                    placeholder="Quartz countertop — 3cm, waterfall edge"
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
                    placeholder="sqft"
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
                <td className="py-1.5 pr-2 text-right tabular-nums">
                  {formatCurrency(lineAmount(item))}
                </td>
                <td className="py-1.5 text-right">
                  <button
                    onClick={() => removeItem(i)}
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
          onClick={addItem}
          className="mt-2 rounded border border-dashed border-stone-300 px-3 py-1.5 text-sm text-stone-500 hover:border-stone-400 hover:text-stone-700"
        >
          + Add line
        </button>

        <div className="mt-4 flex items-end justify-between">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-stone-700">Valid until</span>
            <input
              type="date"
              value={validUntil}
              onChange={(e) => {
                setValidUntil(e.target.value)
                setDirty(true)
              }}
              className="rounded border border-stone-300 px-2 py-1.5 text-sm"
            />
          </label>
          <dl className="w-64 space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-stone-500">Subtotal</dt>
              <dd className="tabular-nums">{formatCurrency(totals.subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-stone-500">HST ({(quote.tax_rate * 100).toFixed(2).replace(/\.?0+$/, '')}%)</dt>
              <dd className="tabular-nums">{formatCurrency(totals.tax_amount)}</dd>
            </div>
            <div className="flex justify-between border-t border-stone-200 pt-1 font-semibold">
              <dt>Total</dt>
              <dd className="tabular-nums">{formatCurrency(totals.total)}</dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={save}
          disabled={saveLines.isPending || !dirty}
          className="rounded bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
        >
          {saveLines.isPending ? 'Saving…' : dirty ? 'Save draft' : 'Saved'}
        </button>
        <button
          onClick={send}
          disabled={sendQuote.isPending || dirty || items.length === 0}
          title={dirty ? 'Save first' : undefined}
          className="rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {sendQuote.isPending ? 'Sending…' : 'Mark as sent'}
        </button>
        {(saveLines.isError || sendQuote.isError) && (
          <span className="text-sm text-red-600">
            {saveLines.error?.message ?? sendQuote.error?.message}
          </span>
        )}
      </div>
    </div>
  )
}

function SentQuoteView({ quote }: { quote: Quote }) {
  const setStatus = useSetQuoteStatus()
  const updateJob = useUpdateJob()
  const [offerWon, setOfferWon] = useState(false)
  const snapshot = quote.body_snapshot

  const accept = () => {
    setStatus.mutate(
      { id: quote.id, status: 'accepted' },
      { onSuccess: () => setOfferWon(true) },
    )
  }

  const items = snapshot?.line_items ?? quote.line_items.map((item) => ({ ...item, amount: lineAmount(item) }))

  return (
    <div>
      <QuoteHeader quote={quote} />
      <div className="mt-4 rounded-lg border border-stone-200 bg-white p-4">
        <p className="mb-3 text-sm text-stone-500">
          Sent {formatDate(quote.sent_at)} — contents are frozen from the snapshot.
          {quote.valid_until && ` Valid until ${formatDate(quote.valid_until)}.`}
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
            {items.map((item, i) => (
              <tr key={i} className="border-b border-stone-100 last:border-0">
                <td className="py-2 pr-2">{item.description}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{item.quantity}</td>
                <td className="py-2 pr-2">{item.unit ?? ''}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{formatCurrency(item.unit_price)}</td>
                <td className="py-2 text-right tabular-nums">{formatCurrency(item.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="ml-auto mt-3 w-64 space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-stone-500">Subtotal</dt>
            <dd className="tabular-nums">{formatCurrency(quote.subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-stone-500">HST</dt>
            <dd className="tabular-nums">{formatCurrency(quote.tax_amount)}</dd>
          </div>
          <div className="flex justify-between border-t border-stone-200 pt-1 font-semibold">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatCurrency(quote.total)}</dd>
          </div>
        </dl>
      </div>

      {quote.status === 'sent' && (
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={accept}
            disabled={setStatus.isPending}
            className="rounded bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            Mark accepted
          </button>
          <button
            onClick={() => setStatus.mutate({ id: quote.id, status: 'declined' })}
            disabled={setStatus.isPending}
            className="rounded border border-red-200 px-4 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            Declined
          </button>
          <button
            onClick={() => setStatus.mutate({ id: quote.id, status: 'expired' })}
            disabled={setStatus.isPending}
            className="rounded border border-stone-300 px-4 py-2 text-sm text-stone-600 hover:bg-stone-50 disabled:opacity-50"
          >
            Expired
          </button>
          {setStatus.isError && (
            <span className="text-sm text-red-600">{setStatus.error.message}</span>
          )}
        </div>
      )}

      {offerWon && quote.job && quote.job.stage !== 'won' && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 className="mb-2 text-lg font-semibold text-stone-900">Quote accepted 🎉</h2>
            <p className="mb-4 text-sm text-stone-600">
              Move {quote.job.job_number} to <strong>Won</strong>?
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setOfferWon(false)}
                className="rounded border border-stone-300 px-4 py-2 text-sm text-stone-700 hover:bg-stone-50"
              >
                Not now
              </button>
              <button
                onClick={() => {
                  updateJob.mutate({
                    id: quote.job!.id,
                    patch: { stage: 'won' as JobStage },
                  })
                  setOfferWon(false)
                }}
                className="rounded bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
              >
                Move to Won
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
