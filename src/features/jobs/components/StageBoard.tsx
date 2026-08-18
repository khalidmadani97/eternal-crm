import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'
import { useProfiles } from '../../auth/api'
import { formatCurrency, formatDate } from '../../../lib/format'
import {
  installDate,
  useJobs,
  useMoveJobStage,
  useSaveStageSettings,
  useStageSettings,
  CLOSE_GRADE_STYLES,
  marginSigns,
} from '../api'
import type { JobListRow, JobStage, StageSetting } from '../api'
import { LostReasonDialog } from './LostReasonDialog'
import { STAGE_LABELS } from './StageBadge'

export function StageBoard({
  stages,
  detailPath = '/jobs',
  phase = 'production',
  pipelineId = null,
  isDefaultPipeline = true,
}: {
  stages: JobStage[]
  detailPath?: string
  phase?: 'pipeline' | 'production'
  pipelineId?: string | null
  isDefaultPipeline?: boolean
}) {
  const { data: jobs, isPending, isError, error, refetch } = useJobs()
  const { data: stageSettings } = useStageSettings()
  const { data: profiles } = useProfiles()
  const { session } = useAuth()
  const [assigneeFilter, setAssigneeFilter] = useState('all')
  const moveStage = useMoveJobStage()
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<JobStage | null>(null)
  const [pendingLost, setPendingLost] = useState<string | null>(null)
  const [customizing, setCustomizing] = useState(false)
  // Mobile: jump-bar chips track which column fills the screen (snap scroll).
  const boardRef = useRef<HTMLDivElement>(null)
  const [activeStage, setActiveStage] = useState<JobStage | null>(null)

  const jumpTo = (stage: JobStage) => {
    setActiveStage(stage)
    boardRef.current
      ?.querySelector(`[data-stage="${stage}"]`)
      ?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' })
  }
  const trackScroll = () => {
    const el = boardRef.current
    if (!el) return
    let best: { stage: JobStage; dist: number } | null = null
    for (const child of el.children) {
      const stage = (child as HTMLElement).dataset.stage as JobStage | undefined
      if (!stage) continue
      const dist = Math.abs((child as HTMLElement).offsetLeft - el.offsetLeft - el.scrollLeft)
      if (!best || dist < best.dist) best = { stage, dist }
    }
    if (best) setActiveStage(best.stage)
  }

  // Custom order + labels; hidden stages still show while occupied. `stages`
  // is already the deduped, ordered key list for THIS pipeline — build one
  // column per key from it, picking this pipeline's own stage row for the
  // label. (Every pipeline owns a row per stage key, so scanning stageSettings
  // by key alone renders each column once per pipeline — the doubling bug.)
  const stageRowFor = (stage: JobStage) => {
    const rows = (stageSettings ?? []).filter((s) => s.stage === stage)
    return (
      rows.find((s) => s.pipeline_id === pipelineId) ??
      rows.find((s) => s.pipeline_id === null) ??
      rows[0]
    )
  }
  const columns: { stage: JobStage; label: string }[] = stages
    .map((stage) => stageRowFor(stage) ?? { stage, label: STAGE_LABELS[stage], hidden: false })
    .filter((s) => !s.hidden || jobs?.some((j) => j.stage === s.stage))
    .map((s) => ({ stage: s.stage, label: s.label }))

  const scoped = jobs
    ?.filter((j) => stages.includes(j.stage))
    .filter((j) => {
      if (phase === 'production' || !pipelineId) return true
      // Legacy/sheet leads without a pipeline live in the default pipeline.
      return j.pipeline_id === pipelineId || (isDefaultPipeline && j.pipeline_id === null)
    })
    .filter((j) => {
      if (assigneeFilter === 'all') return true
      if (assigneeFilter === 'mine') return j.assignee?.id === session?.user.id
      if (assigneeFilter === 'none') return !j.assignee
      return j.assignee?.id === assigneeFilter
    })

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
          <select
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            className="rounded border border-stone-300 bg-white px-2 py-1.5 text-sm"
            aria-label="Filter by owner"
          >
            <option value="all">All owners</option>
            <option value="mine">Mine</option>
            <option value="none">Unassigned</option>
            {profiles?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name ?? 'Unnamed'}
              </option>
            ))}
          </select>
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
      {/* Mobile jump-bar: every stage at a glance, tap to slide there. */}
      <div className="sticky top-0 z-10 -mx-3 mb-2 flex gap-1.5 overflow-x-auto bg-stone-100/95 px-3 py-1.5 backdrop-blur md:hidden">
        {columns.map(({ stage, label }) => {
          const count = (scoped ?? []).filter((j) => j.stage === stage).length
          const active = stage === (activeStage ?? columns[0]?.stage)
          return (
            <button
              key={stage}
              onClick={() => jumpTo(stage)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
                active ? 'bg-stone-900 text-amber-400' : 'bg-white text-stone-600 shadow-sm'
              }`}
            >
              {label}
              <span className={active ? 'ml-1 text-amber-200/80' : 'ml-1 text-stone-400'}>{count}</span>
            </button>
          )
        })}
      </div>
      <div
        ref={boardRef}
        onScroll={trackScroll}
        className="flex flex-1 snap-x gap-2 overflow-x-auto pb-4 [-webkit-overflow-scrolling:touch] sm:gap-3 md:snap-none"
      >
        {columns.map(({ stage, label }) => {
          const inStage = (scoped ?? []).filter((j) => j.stage === stage)
          const total = inStage.reduce(
            (sum, j) => sum + (Number(j.value_final ?? j.value_est) || 0),
            0,
          )
          return (
            <div
              key={stage}
              data-stage={stage}
              onDragOver={(e) => {
                e.preventDefault()
                setDragOver(stage)
              }}
              onDragLeave={() => setDragOver((s) => (s === stage ? null : s))}
              onDrop={(e) => {
                e.preventDefault() // Firefox otherwise navigates to the drag data
                drop(stage)
              }}
              className={`flex w-56 shrink-0 snap-start flex-col rounded-lg border sm:w-60 ${
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
                    detailPath={detailPath}
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
        <CustomizeStagesDialog settings={stageSettings} phase={phase} pipelineId={pipelineId} onClose={() => setCustomizing(false)} />
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
  detailPath,
  onDragStart,
  onDragEnd,
}: {
  job: JobListRow
  dragging: boolean
  detailPath: string
  onDragStart: () => void
  onDragEnd: () => void
}) {
  const install = installDate(job)
  const navigate = useNavigate()
  return (
    <div
      draggable
      onClick={() => void navigate(`${detailPath}/${job.id}`)}
      onDragStart={(e) => {
        // Safari refuses to start a drag without data; keep it text/plain.
        e.dataTransfer.setData('text/plain', job.id)
        e.dataTransfer.effectAllowed = 'move'
        onDragStart()
      }}
      onDragEnd={onDragEnd}
      className={`cursor-pointer rounded border p-3 shadow-sm transition-shadow hover:shadow ${
        job.close_grade
          ? CLOSE_GRADE_STYLES[job.close_grade]
          : 'border-stone-200 bg-white hover:border-amber-300'
      } ${dragging ? 'opacity-40' : ''}`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <Link
          to={`${detailPath}/${job.id}`}
          draggable={false}
          className="text-xs font-semibold text-stone-500 hover:text-amber-700 hover:underline"
        >
          {job.job_number}
        </Link>
        <span className="text-sm font-medium tabular-nums text-stone-900">
          {job.margin_grade && (
            <span className="mr-1 font-bold text-amber-600" title={`Margin potential ${job.margin_grade}/5`}>
              {marginSigns(job.margin_grade)}
            </span>
          )}
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
  phase,
  pipelineId,
  onClose,
}: {
  settings: StageSetting[]
  phase: 'pipeline' | 'production'
  pipelineId?: string | null
  onClose: () => void
}) {
  const save = useSaveStageSettings()
  const [rows, setRows] = useState<StageSetting[]>(
    settings
      .filter((s) =>
        phase === 'production' ? s.pipeline_id === null : !pipelineId || s.pipeline_id === pipelineId,
      )
      .map((s) => ({ ...s })),
  )

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
      <div className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-lg bg-white p-4 shadow-xl sm:p-6">
        <h2 className="mb-1 text-lg font-semibold text-stone-900">Customize {phase === "pipeline" ? "Pipeline" : "Jobs"} stages</h2>
        <p className="mb-4 text-xs text-stone-500">
          Rename, reorder, or hide columns. Hidden stages still appear while they hold jobs, so
          nothing ever disappears. Won/Lost keep their special behaviour whatever you call them.
        </p>
        <ul className="space-y-1.5">
          {rows
            .filter((r) => !(r.stage.startsWith('custom_') && r.hidden))
            .filter((r) => r.phase === phase)
            .map((row) => {
            const i = rows.indexOf(row)
            return (
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
            )
          })}
        </ul>
        {rows.some((r) => r.stage.startsWith('custom_') && r.hidden) && (
          <button
            onClick={() => {
              const next = rows.find((r) => r.stage.startsWith('custom_') && r.hidden)
              if (!next) return
              const name = window.prompt('Name for the new column:', '')
              if (!name?.trim()) return
              setRows(
                rows.map((r) =>
                  r.stage === next.stage
                    ? { ...r, hidden: false, label: name.trim(), phase }
                    : r,
                ),
              )
            }}
            className="mt-3 w-full rounded border border-dashed border-stone-300 px-3 py-1.5 text-sm text-stone-500 hover:border-stone-400 hover:text-stone-700"
          >
            + Add column ({rows.filter((r) => r.stage.startsWith('custom_') && r.hidden).length} left)
          </button>
        )}
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
