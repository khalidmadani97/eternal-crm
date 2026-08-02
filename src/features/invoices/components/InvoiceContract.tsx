import { useJobContracts, signedPdfUrl } from '../../contracts/api'
import { formatDate } from '../../../lib/format'
import { useAttachContract } from '../api'
import type { Invoice } from '../api'

/** Attach the job's contract to an invoice (Slice 43). The signed PDF is
 *  then one click away from the invoice, and the print view notes it. */
export function InvoiceContract({ invoice }: { invoice: Invoice }) {
  const { data: contracts } = useJobContracts(invoice.job_id)
  const attach = useAttachContract()

  const openPdf = async (path: string) => {
    window.open(await signedPdfUrl(path), '_blank')
  }

  const label = (c: { status: string; signed_at: string | null; signer_name: string | null }) =>
    c.status === 'signed'
      ? `Signed ${formatDate(c.signed_at)}${c.signer_name ? ` by ${c.signer_name}` : ''}`
      : `${c.status.charAt(0).toUpperCase()}${c.status.slice(1)}`

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="font-medium text-stone-700">Contract:</span>
      <select
        value={invoice.contract?.id ?? ''}
        onChange={(e) =>
          attach.mutate({ invoiceId: invoice.id, contractId: e.target.value || null })
        }
        disabled={attach.isPending}
        className="rounded border border-stone-300 bg-white px-2 py-1.5 text-sm"
      >
        <option value="">None attached</option>
        {contracts?.map((c) => (
          <option key={c.id} value={c.id}>
            {label(c)} — {c.template_version}
          </option>
        ))}
      </select>
      {invoice.contract?.status === 'signed' && invoice.contract.signed_pdf_path && (
        <button
          onClick={() => void openPdf(invoice.contract!.signed_pdf_path!)}
          className="rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
        >
          View signed PDF
        </button>
      )}
      {invoice.contract && invoice.contract.status !== 'signed' && (
        <span className="text-xs text-amber-700">not signed yet</span>
      )}
      {contracts && contracts.length === 0 && (
        <span className="text-xs text-stone-400">
          No contracts on this job — generate one from the job card.
        </span>
      )}
      {attach.isError && <span className="text-xs text-red-600">{attach.error.message}</span>}
    </div>
  )
}
