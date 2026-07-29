import { useState } from 'react'
import { Link } from 'react-router-dom'
import { formatCurrency, formatDate } from '../../../lib/format'
import { installDate, JOB_STAGES, useJobs, useMoveJobStage } from '../api'
import type { JobListRow, JobStage } from '../api'
import { LostReasonDialog } from '../components/LostReasonDialog'
import { STAGE_LABELS } from '../components/StageBadge'

export function BoardPage() {
  const { data: jobs, isPending, isError, error, refetch } = useJobs()
  const moveStage = useMoveJobStage()
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<JobStage | null>(null)
  const [pendingLost, setPendingLost] = useState<string | null>(null)

  const drop = (stage: JobStage) => {
    setDragOver(null)
    if (!dragId) return
    const job = jobs?.find((j) => j.id === dragId)
    setDragId(null)
    if (!job || job.stage === stage) return
    if (stage === 'lost') {
      setPendingLost(job.id)
      return
    }
    moveStage.mutate({ id: job.id, stage })
  }

  if (isPending) return <p className="py-12 text-center text-stone-500">Loading board…</p>
  if (isError)
    return (
      <div className="py-12 text-center">
        <p className="mb-2 text-red-600">Could not load the board. {error.message}</p>
        <button
          onClick={() => void refetch()}
          className="rounded border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-50"
        >
          Retry
        </button>
      </div>
    )

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-stone-900">Board</h1>
        {moveStage.isError && (
          <span className="text-sm text-red-600">
            Move failed — the card has been put back. {moveStage.error.message}
          </span>
        )}
      </div>
      {jobs.length === 0 && (
        <p className="py-12 text-center text-stone-500">No jobs yet — the board fills from Jobs.</p>
      )}
      <div className="flex flex-1 gap-3 overflow-x-auto pb-4">
        {JOB_STAGES.map((stage) => {
          const inStage = jobs.filter((j) => j.stage === stage)
          const total = inStage.reduce(
            (sum, j) => sum + (Number(j.value_final ?? j.value_est) || 0),
            0,
          )
          return (
            <div
              key={stage}
              onDragOver={(e) => {
                e.preventDefault()
                setDragOver(stage)
              }}
              onDragLeave={() => setDragOver((s) => (s === stage ? null : s))}
              onDrop={() => drop(stage)}
              className={`flex w-60 shrink-0 flex-col rounded-lg border ${
                dragOver === stage ? 'border-amber-500 bg-amber-50' : 'border-stone-200 bg-stone-50'
              }`}
            >
              <div className="border-b border-stone-200 px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-stone-800">
                    {STAGE_LABELS[stage]}
                  </span>
                  <span className="rounded-full bg-stone-200 px-2 py-0.5 text-xs text-stone-600">
                    {inStage.length}
                  </span>
                </div>
                <p className="text-xs tabular-nums text-stone-500">{formatCurrency(total)}</p>
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto p-2">
                {inStage.map((job) => (
                  <BoardCard
                    key={job.id}
                    job={job}
                    dragging={dragId === job.id}
                    onDragStart={() => setDragId(job.id)}
                    onDragEnd={() => setDragId(null)}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
      {pendingLost && (
        <LostReasonDialog
          onCancel={() => setPendingLost(null)}
          onConfirm={(reason) => {
            moveStage.mutate({ id: pendingLost, stage: 'lost', lostReason: reason })
            setPendingLost(null)
          }}
        />
      )}
    </div>
  )
}

function BoardCard({
  job,
  dragging,
  onDragStart,
  onDragEnd,
}: {
  job: JobListRow
  dragging: boolean
  onDragStart: () => void
  onDragEnd: () => void
}) {
  const install = installDate(job)
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`cursor-grab rounded border border-stone-200 bg-white p-3 shadow-sm ${
        dragging ? 'opacity-40' : ''
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <Link
          to={`/jobs/${job.id}`}
          className="text-xs font-semibold text-stone-500 hover:text-amber-700 hover:underline"
        >
          {job.job_number}
        </Link>
        <span className="text-sm font-medium tabular-nums text-stone-900">
          {formatCurrency(job.value_final ?? job.value_est)}
        </span>
      </div>
      <p className="mt-1 truncate text-sm text-stone-800">{job.title}</p>
      <p className="truncate text-xs text-stone-500">{job.contact?.full_name ?? '—'}</p>
      <div className="mt-1 flex items-center justify-between text-xs text-stone-400">
        <span>{install ? `Install ${formatDate(install)}` : 'No install date'}</span>
        <span>{job.assignee?.full_name ?? ''}</span>
      </div>
    </div>
  )
}
