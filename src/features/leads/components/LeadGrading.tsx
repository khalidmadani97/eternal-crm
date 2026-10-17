import { useState } from 'react'
import { useProfiles } from '../../auth/api'
import { useUpdateJob, useJobTasks, useAddTask, useToggleTask } from '../../jobs/api'
import type { JobDetail } from '../../jobs/api'
import { formatDate } from '../../../lib/format'

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
  const { data: tasks } = useJobTasks(job.id)
  const addTask = useAddTask(job.id)
  const toggleTask = useToggleTask(job.id)
  const { data: profiles } = useProfiles()
  const [nsTitle, setNsTitle] = useState('')
  const [nsWho, setNsWho] = useState('')
  const [nsWhen, setNsWhen] = useState('')

  const set = (patch: { close_grade?: number | null; margin_grade?: number | null }) =>
    updateJob.mutate({ id: job.id, patch })

  // The active next step is the most recent uncompleted next-step task.
  const activeNextStep = tasks?.filter((t) => t.is_next_step && !t.completed_at).at(-1) ?? null

  const saveNextStep = async () => {
    if (!nsTitle.trim()) return
    await addTask.mutateAsync({
      title: nsTitle.trim(),
      dueDate: nsWhen || null,
      assignedTo: nsWho || null,
      isNextStep: true,
    })
    setNsTitle('')
    setNsWho('')
    setNsWhen('')
  }

  const complete = () => {
    if (!activeNextStep) return
    toggleTask.mutate({ id: activeNextStep.id, done: true })
  }

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

        {/* Next Steps — shows active step or the add form */}
        <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-3">
          <p className="mb-2 text-sm font-bold uppercase tracking-wide text-amber-800">
            Next Step
          </p>

          {activeNextStep ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-stone-900">{activeNextStep.title}</p>
              <div className="flex items-center gap-2 text-xs text-stone-500">
                {activeNextStep.assignee && (
                  <span className="flex items-center gap-1">
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                      <circle cx="6" cy="4" r="2.2"/>
                      <path d="M1.5 10.5c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4"/>
                    </svg>
                    {activeNextStep.assignee.full_name ?? 'Unassigned'}
                  </span>
                )}
                {activeNextStep.due_date && (
                  <span className="flex items-center gap-1">
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="1" y="2" width="10" height="9" rx="1.5"/>
                      <path d="M1 5h10M4 1v2M8 1v2"/>
                    </svg>
                    {formatDate(activeNextStep.due_date)}
                  </span>
                )}
              </div>
              <button
                onClick={complete}
                disabled={toggleTask.isPending}
                className="mt-1 flex w-full items-center justify-center gap-1.5 rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
              >
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 7l3 3 6-6"/>
                </svg>
                Mark complete
              </button>
              {toggleTask.isError && (
                <p className="text-xs text-red-600">{toggleTask.error.message}</p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <input
                value={nsTitle}
                onChange={(e) => setNsTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void saveNextStep() }}
                placeholder="What needs to happen next?"
                className="w-full rounded border border-amber-300 bg-white px-3 py-2 text-sm focus:border-amber-600 focus:outline-none"
              />
              <div className="flex gap-2">
                <select
                  value={nsWho}
                  onChange={(e) => setNsWho(e.target.value)}
                  className="flex-1 rounded border border-amber-300 bg-white px-2 py-2 text-sm focus:border-amber-600 focus:outline-none"
                >
                  <option value="">Who?</option>
                  {profiles?.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name ?? 'Unnamed'}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  value={nsWhen}
                  onChange={(e) => setNsWhen(e.target.value)}
                  className="rounded border border-amber-300 bg-white px-2 py-2 text-sm focus:border-amber-600 focus:outline-none"
                />
                <button
                  onClick={() => void saveNextStep()}
                  disabled={addTask.isPending || !nsTitle.trim()}
                  className="rounded bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  {addTask.isPending ? '…' : 'Set'}
                </button>
              </div>
              {addTask.isError && (
                <p className="text-xs text-red-600">{addTask.error.message}</p>
              )}
            </div>
          )}
        </div>

        {updateJob.isError && <p className="text-sm text-red-600">{updateJob.error.message}</p>}
      </div>
    </section>
  )
}
