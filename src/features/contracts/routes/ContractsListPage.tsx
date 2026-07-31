import { useState } from 'react'
import { Link } from 'react-router-dom'
import { formatDateTime } from '../../../lib/format'
import { signedPdfUrl, signingUrl, useAllContracts } from '../api'

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-stone-200 text-stone-700',
  sent: 'bg-blue-100 text-blue-800',
  signed: 'bg-emerald-100 text-emerald-800',
  declined: 'bg-red-100 text-red-800',
  void: 'bg-red-100 text-red-800',
}

export function ContractsListPage() {
  const { data: contracts, isPending, isError, error, refetch } = useAllContracts()
  const [copied, setCopied] = useState<string | null>(null)

  const copyLink = async (id: string, token: string) => {
    await navigator.clipboard.writeText(signingUrl(token))
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  const openPdf = async (path: string) => {
    window.open(await signedPdfUrl(path), '_blank')
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-stone-900">Contracts</h1>
      </div>
      <p className="mb-4 text-sm text-stone-500">
        Generate a contract from any job card, send the signing link, and the client e-signs on
        their phone — name, email, IP, and timestamp are captured into a tamper-evident PDF
        (legally binding under Ontario's <em>Electronic Commerce Act, 2000</em>).
      </p>

      {isPending && <p className="py-12 text-center text-stone-500">Loading contracts…</p>}
      {isError && (
        <div className="py-12 text-center">
          <p className="mb-2 text-red-600">Could not load contracts. {error.message}</p>
          <button
            onClick={() => void refetch()}
            className="rounded border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-50"
          >
            Retry
          </button>
        </div>
      )}
      {contracts && contracts.length === 0 && (
        <p className="py-12 text-center text-stone-500">
          No contracts yet — open a job and hit “+ Generate” under Contracts.
        </p>
      )}

      {contracts && contracts.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500">
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Job</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Sent</th>
                <th className="px-4 py-3">Signed</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((c) => (
                <tr key={c.id} className="border-b border-stone-100 last:border-0 hover:bg-stone-50">
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[c.status]}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {c.job && (
                      <Link to={`/jobs/${c.job.id}`} className="font-medium text-stone-900 hover:text-amber-700 hover:underline">
                        {c.job.job_number} — {c.job.title}
                      </Link>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {c.signer_name ?? c.job?.contact?.full_name ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-stone-500">{formatDateTime(c.sent_at)}</td>
                  <td className="px-4 py-3 text-xs text-stone-500">{formatDateTime(c.signed_at)}</td>
                  <td className="px-4 py-3 text-right">
                    {c.status === 'sent' && c.sign_token && (
                      <button
                        onClick={() => void copyLink(c.id, c.sign_token!)}
                        className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
                      >
                        {copied === c.id ? 'Copied!' : 'Copy signing link'}
                      </button>
                    )}
                    {c.status === 'signed' && c.signed_pdf_path && (
                      <button
                        onClick={() => void openPdf(c.signed_pdf_path!)}
                        className="rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
                      >
                        Signed PDF
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
