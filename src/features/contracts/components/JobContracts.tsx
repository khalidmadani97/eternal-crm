import { useState } from 'react'
import type { JobDetail } from '../../jobs/api'
import { formatDateTime } from '../../../lib/format'
import {
  signedPdfUrl,
  signingUrl,
  useGenerateContract,
  useJobContracts,
  useSendContract,
  useVoidContract,
} from '../api'
import type { Contract } from '../api'

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-stone-200 text-stone-700',
  sent: 'bg-blue-100 text-blue-800',
  signed: 'bg-emerald-100 text-emerald-800',
  declined: 'bg-red-100 text-red-800',
  void: 'bg-red-100 text-red-800',
}

export function JobContracts({ job }: { job: JobDetail }) {
  const { data: contracts, isPending, isError, error } = useJobContracts(job.id)
  const generate = useGenerateContract()
  const [viewing, setViewing] = useState<Contract | null>(null)

  return (
    <section className="rounded-lg border border-stone-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Contracts</h2>
        <button
          onClick={() =>
            generate.mutate({
              jobId: job.id,
              contactName: job.contact?.full_name ?? 'Client',
              siteAddress: job.site_address,
              jobTitle: job.title,
              jobNumber: job.job_number,
              total: job.value_final ?? job.value_est,
            })
          }
          disabled={generate.isPending}
          className="rounded border border-stone-300 px-2 py-1 text-xs text-stone-700 hover:bg-stone-50 disabled:opacity-50"
        >
          {generate.isPending ? 'Generating…' : '+ Generate'}
        </button>
      </div>
      {generate.isError && (
        <p className="mb-2 text-sm text-red-600">Could not generate. {generate.error.message}</p>
      )}
      {isPending && <p className="py-2 text-sm text-stone-500">Loading contracts…</p>}
      {isError && (
        <p className="py-2 text-sm text-red-600">Could not load contracts. {error.message}</p>
      )}
      {contracts && contracts.length === 0 && (
        <p className="py-2 text-sm text-stone-500">No contracts.</p>
      )}
      <ul className="space-y-2">
        {contracts?.map((c) => (
          <li key={c.id} className="text-sm">
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[c.status]}`}>
                {c.status}
              </span>
              <button
                onClick={() => setViewing(c)}
                className="text-stone-900 hover:text-amber-700 hover:underline"
              >
                {c.template_version}
              </button>
              <span className="ml-auto text-xs text-stone-400">
                {c.signed_at
                  ? `signed ${formatDateTime(c.signed_at)}`
                  : c.sent_at
                    ? `sent ${formatDateTime(c.sent_at)}`
                    : formatDateTime(c.created_at)}
              </span>
            </div>
            <ContractActions contract={c} />
          </li>
        ))}
      </ul>
      {viewing && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-lg bg-white p-6 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-stone-900">Contract</h2>
              <button onClick={() => setViewing(null)} className="text-stone-400 hover:text-stone-700">
                ✕
              </button>
            </div>
            <pre className="flex-1 overflow-y-auto whitespace-pre-wrap rounded border border-stone-200 bg-stone-50 p-4 text-xs leading-relaxed">
              {viewing.body_snapshot}
            </pre>
          </div>
        </div>
      )}
    </section>
  )
}

function ContractActions({ contract }: { contract: Contract }) {
  const sendContract = useSendContract()
  const voidContract = useVoidContract()
  const [copied, setCopied] = useState(false)

  const copyLink = async (token: string) => {
    await navigator.clipboard.writeText(signingUrl(token))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const openPdf = async (path: string) => {
    const url = await signedPdfUrl(path)
    window.open(url, '_blank')
  }

  return (
    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
      {contract.status === 'draft' && (
        <>
          <button
            onClick={() => {
              if (window.confirm('Send for signature? The contract text freezes once sent.'))
                sendContract.mutate(contract)
            }}
            disabled={sendContract.isPending}
            className="rounded bg-stone-900 px-2 py-1 font-medium text-white hover:bg-stone-800 disabled:opacity-50"
          >
            {sendContract.isPending ? 'Sending…' : 'Send for signature'}
          </button>
          <button
            onClick={() => voidContract.mutate(contract.id)}
            className="rounded border border-stone-300 px-2 py-1 text-stone-600 hover:bg-stone-50"
          >
            Void
          </button>
        </>
      )}
      {contract.status === 'sent' && contract.sign_token && (
        <>
          <button
            onClick={() => void copyLink(contract.sign_token!)}
            className="rounded border border-amber-300 bg-amber-50 px-2 py-1 font-medium text-amber-800 hover:bg-amber-100"
          >
            {copied ? 'Copied!' : 'Copy signing link'}
          </button>
          <button
            onClick={() => voidContract.mutate(contract.id)}
            className="rounded border border-stone-300 px-2 py-1 text-stone-600 hover:bg-stone-50"
          >
            Void
          </button>
        </>
      )}
      {contract.status === 'signed' && (
        <>
          <span className="text-stone-500">
            {contract.signer_name} · {contract.signer_email}
          </span>
          {contract.signed_pdf_path && (
            <button
              onClick={() => void openPdf(contract.signed_pdf_path!)}
              className="rounded border border-emerald-300 bg-emerald-50 px-2 py-1 font-medium text-emerald-800 hover:bg-emerald-100"
            >
              Signed PDF
            </button>
          )}
        </>
      )}
      {(sendContract.isError || voidContract.isError) && (
        <span className="text-red-600">
          {sendContract.error?.message ?? voidContract.error?.message}
        </span>
      )}
    </div>
  )
}
