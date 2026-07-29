import { Link, useNavigate } from 'react-router-dom'
import { formatCurrency, formatDate } from '../../../lib/format'
import { useCreateQuote, useJobQuotes } from '../api'

export function JobQuotes({ jobId }: { jobId: string }) {
  const { data: quotes, isPending, isError, error } = useJobQuotes(jobId)
  const createQuote = useCreateQuote()
  const navigate = useNavigate()

  const newQuote = () => {
    createQuote.mutate(jobId, {
      onSuccess: ({ id }) => void navigate(`/quotes/${id}`),
    })
  }

  return (
    <section className="rounded-lg border border-stone-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Quotes</h2>
        <button
          onClick={newQuote}
          disabled={createQuote.isPending}
          className="rounded border border-stone-300 px-2 py-1 text-xs text-stone-700 hover:bg-stone-50 disabled:opacity-50"
        >
          {createQuote.isPending ? 'Creating…' : '+ New'}
        </button>
      </div>
      {createQuote.isError && (
        <p className="mb-2 text-sm text-red-600">Could not create. {createQuote.error.message}</p>
      )}
      {isPending && <p className="py-2 text-sm text-stone-500">Loading quotes…</p>}
      {isError && <p className="py-2 text-sm text-red-600">Could not load quotes. {error.message}</p>}
      {quotes && quotes.length === 0 && <p className="py-2 text-sm text-stone-500">No quotes.</p>}
      <ul className="space-y-2">
        {quotes?.map((q) => (
          <li key={q.id} className="flex items-center justify-between text-sm">
            <Link to={`/quotes/${q.id}`} className="font-medium text-stone-900 hover:text-amber-700 hover:underline">
              {q.quote_number}
            </Link>
            <span className="text-xs text-stone-400">{q.status} · {formatDate(q.created_at)}</span>
            <span className="tabular-nums">{formatCurrency(q.total)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
