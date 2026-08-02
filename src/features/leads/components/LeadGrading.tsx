import { useUpdateJob } from '../../jobs/api'
import type { JobDetail } from '../../jobs/api'

// Qualification grading (Slice 48): close probability colors the lead card
// across the app; margin potential shows as $…$$$$$.

const CLOSE_COLORS: Record<number, string> = {
  5: 'bg-emerald-500 text-white',
  4: 'bg-green-400 text-white',
  3: 'bg-yellow-400 text-stone-900',
  2: 'bg-orange-400 text-white',
  1: 'bg-red-500 text-white',
}
const CLOSE_LABELS: Record<number, string> = {
  5: 'Very likely',
  4: 'Likely',
  3: 'Maybe',
  2: 'Unlikely',
  1: 'Very unlikely',
}

export function LeadGrading({ job }: { job: JobDetail }) {
  const updateJob = useUpdateJob()
  const set = (patch: { close_grade?: number | null; margin_grade?: number | null }) =>
    updateJob.mutate({ id: job.id, patch })

  return (
    <section className="rounded-lg border border-stone-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">
        Qualification
      </h2>
      <div className="space-y-3">
        <div>
          <p className="mb-1.5 text-sm font-medium text-stone-700">
            Probability to close
            {job.close_grade && (
              <span className="ml-2 text-xs font-normal text-stone-500">
                {CLOSE_LABELS[job.close_grade]}
              </span>
            )}
          </p>
          <div className="flex gap-1.5">
            {[1, 2, 3, 4, 5].map((g) => (
              <button
                key={g}
                onClick={() => set({ close_grade: job.close_grade === g ? null : g })}
                title={CLOSE_LABELS[g]}
                className={`h-8 w-10 rounded text-sm font-bold transition-transform hover:scale-105 ${
                  job.close_grade === g
                    ? CLOSE_COLORS[g] + ' ring-2 ring-stone-900/20'
                    : 'bg-stone-100 text-stone-400 hover:bg-stone-200'
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-sm font-medium text-stone-700">Margin potential</p>
          <div className="flex gap-1.5">
            {[1, 2, 3, 4, 5].map((g) => (
              <button
                key={g}
                onClick={() => set({ margin_grade: job.margin_grade === g ? null : g })}
                title={`${'$'.repeat(g)} margin`}
                className={`h-8 rounded px-2 text-sm font-bold tabular-nums transition-transform hover:scale-105 ${
                  job.margin_grade === g
                    ? 'bg-amber-500 text-white ring-2 ring-stone-900/20'
                    : 'bg-stone-100 text-stone-400 hover:bg-stone-200'
                }`}
              >
                {'$'.repeat(g)}
              </button>
            ))}
          </div>
        </div>
        {updateJob.isError && <p className="text-sm text-red-600">{updateJob.error.message}</p>}
      </div>
    </section>
  )
}
