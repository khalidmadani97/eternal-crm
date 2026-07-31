import { useState } from 'react'
import { Link } from 'react-router-dom'
import { formatCurrency, formatDate } from '../../../lib/format'
import {
  installDate,
  JOB_STAGES,
  useJobs,
  useMoveJobStage,
  useSaveStageSettings,
  useStageSettings,
} from '../api'
import type { JobListRow, JobStage, StageSetting } from '../api'
import { LostReasonDialog } from './LostReasonDialog'
import { STAGE_LABELS } from './StageBadge'

export function StageBoard({ stages }: { stages: JobStage[] }) {
  const { data: jobs, isPending, isError, error, refetch } = useJobs()
  const { data: stageSettings } = useStageSettings()
  const moveStage = useMoveJobStage()
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<JobStage | null>(null)
  const [pendingLost, setPendingLost] = useState<string | null>(null)
  const [customizing, setCustomizing] = useState(false)

  // Custom order + labels; hidden stages still show while occupied.
  const columns: { stage: JobStage; label: string }[] = (
    stageSettings ?? JOB_STAGES.map((s, i) => ({ stage: s, label: STAGE_LABELS[s], position: i, hidden: false }))
  )
    .filter((s) => stages.includes(s.stage))
    .filter((s) => !s.hidden || jobs?.some((j) => j.stage === s.stage))
    .map((s) => ({ stage: s.stage, label: s.label }))

  const scoped = jobs?.filter((j) => stages.includes(j.stage))

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
      <div className="mb-3 flex items-center justify-end">
        <div className="flex items-center gap-3">
          {moveStage.isError && (
            <span className="text-sm text-red-600">
              Move failed — the card has been put back. {moveStage.error.message}
            </span>
          )}
          <button
            onClick={() => setCustomizing(true)}
            className="rounded border border-stone-300 px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-50"
          >
            Customize stages
          </button>
        </div>
      </div>
      {scoped && scoped.length === 0 && (
        <p className="py-12 text-center text-stone-500">Nothing here yet.</p>
      )}
      <div className="flex flex-1 gap-3 overflow-x-auto pb-4">
        {columns.map(({ stage, label }) => {
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
              onDrop={(e) => {
                e.preventDefault() // Firefox otherwise navigates to the drag data
                drop(stage)
              }}
              className={`flex w-60 shrink-0 flex-col rounded-lg border ${
                dragOver === stage ? 'border-amber-500 bg-amber-50' : 'border-stone-200 bg-stone-50'
              }`}
            >
              <div className="border-b border-stone-200 px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-stone-800">{label}</span>
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
      {customizing && stageSettings && (
        <CustomizeStagesDialog settings={stageSettings} onClose={() => setCustomizing(false)} />
      )}
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
      onDragStart={(e) => {
        // Safari refuses to start a drag without data; keep it text/plain.
        e.dataTransfer.setData('text/plain', job.id)
        e.dataTransfer.effectAllowed = 'move'
        onDragStart()
      }}
      onDragEnd={onDragEnd}
      className={`cursor-grab rounded border border-stone-200 bg-white p-3 shadow-sm ${
        dragging ? 'opacity-40' : ''
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <Link
          to={`/jobs/${job.id}`}
          draggable={false}
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

function CustomizeStagesDialog({
  settings,
  onClose,
}: {
  settings: StageSetting[]
  onClose: () => void
}) {
  const save = useSaveStageSettings()
  const [rows, setRows] = useState<StageSetting[]>(settings.map((s) => ({ ...s })))

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir
    if (target < 0 || target >= rows.length) return
    const next = [...rows]
    ;[next[index], next[target]] = [next[target], next[index]]
    setRows(next.map((r, i) => ({ ...r, position: i })))
  }

  const submit = () => {
    const cleaned = rows.map((r, i) => ({ ...r, label: r.label.trim() || r.stage, position: i }))
    save.mutate(cleaned, { onSuccess: onClose })
  }

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 className="mb-1 text-lg font-semibold text-stone-900">Customize stages</h2>
        <p className="mb-4 text-xs text-stone-500">
          Rename, reorder, or hide columns. Hidden stages still appear while they hold jobs, so
          nothing ever disappears. Won/Lost keep their special behaviour whatever you call them.
        </p>
        <ul className="space-y-1.5">
          {rows.map((row, i) => (
            <li key={row.stage} className="flex items-center gap-2">
              <div className="flex flex-col">
                <button
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  className="px-1 text-xs text-stone-400 hover:text-stone-700 disabled:opacity-30"
                  aria-label={`Move ${row.label} up`}
                >
                  ▲
                </button>
                <button
                  onClick={() => move(i, 1)}
                  disabled={i === rows.length - 1}
                  className="px-1 text-xs text-stone-400 hover:text-stone-700 disabled:opacity-30"
                  aria-label={`Move ${row.label} down`}
                >
                  ▼
                </button>
              </div>
              <input
                value={row.label}
                onChange={(e) =>
                  setRows(rows.map((r) => (r.stage === row.stage ? { ...r, label: e.target.value } : r)))
                }
                className="flex-1 rounded border border-stone-300 px-2 py-1.5 text-sm focus:border-amber-600 focus:outline-none"
              />
              <label className="flex items-center gap-1 text-xs text-stone-500">
                <input
                  type="checkbox"
                  checked={row.hidden}
                  onChange={(e) =>
                    setRows(rows.map((r) => (r.stage === row.stage ? { ...r, hidden: e.target.checked } : r)))
                  }
                  className="h-3.5 w-3.5 accent-amber-600"
                />
                hide
              </label>
            </li>
          ))}
        </ul>
        {save.isError && <p className="mt-2 text-sm text-red-600">{save.error.message}</p>}
        <div className="mt-4 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded border border-stone-300 px-4 py-2 text-sm text-stone-700 hover:bg-stone-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={save.isPending}
            className="rounded bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
          >
            {save.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
