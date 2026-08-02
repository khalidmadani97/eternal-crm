import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../../lib/supabase'
import { formatDateTime, formatPhone } from '../../../lib/format'
import type { JobDetail } from '../../jobs/api'

// Lead info panel (Slice 41): everything known about where this lead came
// from — source, when it arrived, and every answer from the lead form
// (pulled from the raw inbound record, so nothing the sheet sent is lost).

interface InboundInfo {
  provider: string
  received_at: string
  parsed_message: string | null
  raw_payload: Record<string, string>
}

function useLeadOrigin(jobId: string) {
  return useQuery({
    queryKey: ['lead-origin', jobId],
    queryFn: async (): Promise<InboundInfo | null> => {
      const { data, error } = await supabase
        .from('inbound_leads')
        .select('provider, received_at, parsed_message, raw_payload')
        .eq('job_id', jobId)
        .order('received_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data as InboundInfo | null
    },
  })
}

const META_KEY = /time|date|^id$|campaign|ad.?(set|name|id)|form|platform|source|created|submit/

export function LeadInfo({ job }: { job: JobDetail }) {
  const { data: origin, isPending, isError, error } = useLeadOrigin(job.id)

  const formAnswers = origin
    ? Object.entries(origin.raw_payload).filter(
        ([k, v]) => v?.trim() && !META_KEY.test(k.toLowerCase()),
      )
    : []

  return (
    <section className="rounded-lg border border-stone-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">
        Lead info
      </h2>
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase tracking-wide text-stone-400">Contact</dt>
          <dd className="text-stone-800">{job.contact?.full_name ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-stone-400">Phone</dt>
          <dd className="tabular-nums text-stone-800">{formatPhone(job.contact?.phone)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-stone-400">Source</dt>
          <dd className="text-stone-800">
            {job.lead_source ?? '—'}
            {origin && (
              <span className="ml-1.5 rounded bg-stone-100 px-1.5 py-0.5 text-xs text-stone-500">
                {origin.provider}
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-stone-400">Arrived</dt>
          <dd className="text-stone-800">
            {origin ? formatDateTime(origin.received_at) : formatDateTime(job.created_at)}
          </dd>
        </div>
      </dl>

      {isPending && <p className="mt-3 text-sm text-stone-500">Checking lead origin…</p>}
      {isError && <p className="mt-3 text-sm text-red-600">Could not load origin. {error.message}</p>}

      {formAnswers.length > 0 && (
        <div className="mt-3 border-t border-stone-100 pt-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">
            Form answers
          </p>
          <dl className="space-y-1.5 text-sm">
            {formAnswers.map(([question, answer]) => (
              <div key={question} className="grid grid-cols-[minmax(6rem,40%)_1fr] gap-2">
                <dt className="truncate text-stone-500" title={question}>
                  {question.replace(/[_-]+/g, ' ')}
                </dt>
                <dd className="text-stone-800">{answer}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      {origin && formAnswers.length === 0 && origin.parsed_message && (
        <p className="mt-3 border-t border-stone-100 pt-3 text-sm text-stone-700">
          {origin.parsed_message}
        </p>
      )}
    </section>
  )
}
