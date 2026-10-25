import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'
import { useProfiles } from '../../auth/api'
import { formatCurrency, formatDate, calcMargin, marginColor } from '../../../lib/format'
import {
  installDate,
  useJobs,
  useMoveJobStage,
  useSaveStageSettings,
  useStageSettings,
  useUpdateJob,
  useToggleFollowUp,
  useBulkArchiveJobs,
  useBulkMoveStage,
  useBulkAssign,
  useBulkToggleFollowUp,
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
  const [searchTerm, setSearchTerm] = useState('')
  const [assigneeFilter, setAssigneeFilter] = useState('all')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [directionFilter, setDirectionFilter] = useState('all')
  const moveStage = useMoveJobStage()
  const updateJob = useUpdateJob()
  const toggleFollowUp = useToggleFollowUp()
  const archiveJob = useBulkArchiveJobs()
  const bulkMove = useBulkMoveStage()
  const bulkAssign = useBulkAssign()
  const bulkFollowUp = useBulkToggleFollowUp()
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<JobStage | null>(null)
  const [pendingLost, setPendingLost] = useState<string | null>(null)
  const [customizing, setCustomizing] = useState(false)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [rubberBand, setRubberBand] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  const [bulkMoveError, setBulkMoveError] = useState<string | null>(null)
  const [bulkMoveTarget, setBulkMoveTarget] = useState('')

  const handleCardSelect = (id: string, shift: boolean) => {
    if (shift) {
      setSelectedIds((prev) => new Set([...prev, id]))
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id); else next.add(id)
        return next
      })
    }
  }

  const exitSelection = () => {
    setSelectionMode(false)
    setSelectedIds(new Set())
  }

  // allVisibleIds computed after scoped is defined below
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
    .filter((j) => sourceFilter === 'all' || j.lead_source === sourceFilter)
    .filter((j) => directionFilter === 'all' || j.direction === directionFilter)
    .filter((j) => {
      if (!searchTerm.trim()) return true
      const q = searchTerm.toLowerCase()
      return (
        j.title.toLowerCase().includes(q) ||
        (j.contact?.full_name ?? '').toLowerCase().includes(q) ||
        (j.summary ?? '').toLowerCase().includes(q)
      )
    })

  const allVisibleIds = (scoped ?? []).map((j) => j.id)

  const selectAllInStage = (stage: JobStage) => {
    const ids = (scoped ?? []).filter((j) => j.stage === stage).map((j) => j.id)
    const allSelected = ids.length > 0 && ids.every((id) => selectedIds.has(id))
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allSelected) ids.forEach((id) => next.delete(id))
      else ids.forEach((id) => next.add(id))
      return next
    })
  }

  const startRubberBand = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!selectionMode) return
    const target = e.target as Element
    if (target.closest('[data-card-id]')) return // let card handle it
    setRubberBand({ x1: e.clientX, y1: e.clientY, x2: e.clientX, y2: e.clientY })
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const moveRubberBand = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!rubberBand) return
    setRubberBand((b) => b ? { ...b, x2: e.clientX, y2: e.clientY } : null)
  }

  const finishRubberBand = () => {
    if (!rubberBand) return
    const { x1, y1, x2, y2 } = rubberBand
    const minX = Math.min(x1, x2), maxX = Math.max(x1, x2)
    const minY = Math.min(y1, y2), maxY = Math.max(y1, y2)
    if (maxX - minX > 4 || maxY - minY > 4) { // ignore tiny accidental drags
      const cards = document.querySelectorAll<HTMLElement>('[data-card-id]')
      setSelectedIds((prev) => {
        const next = new Set(prev)
        cards.forEach((el) => {
          const r = el.getBoundingClientRect()
          if (r.left < maxX && r.right > minX && r.top < maxY && r.bottom > minY)
            next.add(el.dataset.cardId!)
        })
        return next
      })
    }
    setRubberBand(null)
  }

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
      <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search…"
            className="w-36 rounded border border-stone-300 bg-white px-2 py-1.5 text-sm focus:border-amber-600 focus:outline-none sm:w-48"
          />
          {/* Owner */}
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
          {/* Source */}
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="rounded border border-stone-300 bg-white px-2 py-1.5 text-sm"
            aria-label="Filter by source"
          >
            <option value="all">All sources</option>
            {[...new Set((jobs ?? []).map((j) => j.lead_source).filter(Boolean))].sort().map((s) => (
              <option key={s} value={s!}>{s}</option>
            ))}
          </select>
          {/* Direction */}
          <select
            value={directionFilter}
            onChange={(e) => setDirectionFilter(e.target.value)}
            className="rounded border border-stone-300 bg-white px-2 py-1.5 text-sm"
            aria-label="Filter by direction"
          >
            <option value="all">All directions</option>
            <option value="north">North</option>
            <option value="south">South</option>
            <option value="east">East</option>
            <option value="west">West</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          {moveStage.isError && (
            <span className="text-sm text-red-600">
              Move failed — the card has been put back. {moveStage.error.message}
            </span>
          )}
          <button
            onClick={() => setSelectionMode((v) => !v)}
            className={`rounded border px-3 py-1.5 text-sm ${
              selectionMode
                ? 'border-amber-500 bg-amber-50 text-amber-800'
                : 'border-stone-300 text-stone-700 hover:bg-stone-50'
            }`}
          >
            {selectionMode ? `Selecting (${selectedIds.size})` : 'Select'}
          </button>
          <button
            onClick={() => setCustomizing(true)}
            className="rounded border border-stone-300 px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-50"
          >
            Customize stages
          </button>
        </div>
      </div>

      {/* Bulk action bar — only visible when at least one card is selected */}
      {selectionMode && (
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
          <span className="text-sm font-medium text-amber-900">
            {selectedIds.size === 0
              ? 'Tap cards to select'
              : `${selectedIds.size} selected`}
          </span>
          {selectedIds.size > 0 && (
            <>
              <button
                onClick={() => setSelectedIds(new Set(allVisibleIds))}
                className="text-xs text-amber-700 underline hover:text-amber-900"
              >
                Select all ({allVisibleIds.length})
              </button>

              {/* Move to stage */}
              <select
                value={bulkMoveTarget}
                onChange={(e) => {
                  const target = e.target.value as JobStage
                  if (!target) return
                  setBulkMoveError(null)
                  setBulkMoveTarget(target)
                  bulkMove.mutate(
                    { ids: [...selectedIds], stage: target },
                    {
                      onSuccess: () => {
                        setBulkMoveTarget('')
                        exitSelection()
                        jumpTo(target)
                      },
                      onError: (err) => {
                        setBulkMoveTarget('')
                        setBulkMoveError((err as Error).message ?? 'Move failed')
                      },
                    },
                  )
                }}
                disabled={bulkMove.isPending}
                className="rounded border border-amber-300 bg-white px-2 py-1 text-sm text-stone-700"
              >
                <option value="">{bulkMove.isPending ? 'Moving…' : 'Move to…'}</option>
                {stages.map((s) => (
                  <option key={s} value={s}>{STAGE_LABELS[s] ?? s}</option>
                ))}
              </select>

              {/* Assign to */}
              <select
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value === '') return
                  bulkAssign.mutate(
                    { ids: [...selectedIds], userId: e.target.value === '_none' ? null : e.target.value },
                    { onSuccess: exitSelection },
                  )
                  e.target.value = ''
                }}
                disabled={bulkAssign.isPending}
                className="rounded border border-amber-300 bg-white px-2 py-1 text-sm text-stone-700"
              >
                <option value="">Assign to…</option>
                <option value="_none">Unassign</option>
                {profiles?.map((p) => (
                  <option key={p.id} value={p.id}>{p.full_name ?? 'Unnamed'}</option>
                ))}
              </select>

              {/* Follow up */}
              <button
                onClick={() => {
                  const selectedJobs = (scoped ?? []).filter((j) => selectedIds.has(j.id))
                  const allFollowed = selectedJobs.every((j) => j.follow_up)
                  bulkFollowUp.mutate(
                    { ids: [...selectedIds], value: !allFollowed },
                    { onSuccess: exitSelection },
                  )
                }}
                disabled={bulkFollowUp.isPending}
                className="rounded border border-amber-300 bg-white px-3 py-1 text-sm text-stone-700 hover:bg-amber-100"
              >
                Follow up
              </button>

              {/* Archive */}
              <button
                onClick={() => {
                  const n = selectedIds.size
                  const ok = n >= 10
                    ? window.prompt(`You're about to archive ${n} leads. Type ${n} to confirm.`) === String(n)
                    : window.confirm(`Archive ${n} lead${n > 1 ? 's' : ''}? They will be hidden from the board.`)
                  if (ok) archiveJob.mutate([...selectedIds], { onSuccess: exitSelection })
                }}
                disabled={archiveJob.isPending}
                className="rounded border border-red-300 bg-red-50 px-3 py-1 text-sm text-red-700 hover:bg-red-100"
              >
                Archive
              </button>
            </>
          )}
          {selectedIds.size === 0 && allVisibleIds.length > 0 && (
            <button
              onClick={() => setSelectedIds(new Set(allVisibleIds))}
              className="text-xs text-amber-700 underline hover:text-amber-900"
            >
              Select all ({allVisibleIds.length})
            </button>
          )}
          <button
            onClick={exitSelection}
            className="ml-auto rounded border border-amber-300 px-3 py-1 text-sm text-stone-700 hover:bg-amber-100"
          >
            Cancel
          </button>
        </div>
      )}
      {bulkMoveError && (
        <div className="mb-2 flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          <span>Move failed: {bulkMoveError}</span>
          <button onClick={() => setBulkMoveError(null)} className="ml-auto text-red-500 hover:text-red-700">✕</button>
        </div>
      )}
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
          onPointerDown={startRubberBand}
        onPointerMove={moveRubberBand}
        onPointerUp={finishRubberBand}
        onPointerLeave={finishRubberBand}
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
              className={`flex w-64 shrink-0 snap-start flex-col rounded-lg border sm:w-72 ${
                dragOver === stage ? 'border-amber-500 bg-amber-50' : 'border-stone-200 bg-stone-50'
              }`}
            >
              <div className="border-b border-stone-200 px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-stone-800">{label}</span>
                  <div className="flex items-center gap-2">
                    {selectionMode && inStage.length > 0 && (
                      <button
                        onClick={() => selectAllInStage(stage)}
                        className="flex items-center gap-1 text-xs text-amber-700 hover:text-amber-900"
                      >
                        <span
                          className={`flex h-3.5 w-3.5 items-center justify-center rounded border ${
                            inStage.every((j) => selectedIds.has(j.id))
                              ? 'border-amber-500 bg-amber-500'
                              : inStage.some((j) => selectedIds.has(j.id))
                              ? 'border-amber-400 bg-amber-200'
                              : 'border-stone-400 bg-white'
                          }`}
                        >
                          {inStage.every((j) => selectedIds.has(j.id)) && (
                            <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M1 4l2 2 4-4"/>
                            </svg>
                          )}
                        </span>
                        All
                      </button>
                    )}
                    <span className="rounded-full bg-stone-200 px-2 py-0.5 text-xs text-stone-600">
                      {inStage.length}
                    </span>
                  </div>
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
                    selectionMode={selectionMode}
                    selected={selectedIds.has(job.id)}
                    onToggleSelect={(shift) => handleCardSelect(job.id, shift)}
                    onDragStart={() => setDragId(job.id)}
                    onDragEnd={() => setDragId(null)}
                    stages={stages}
                    onMoveStage={(s) => moveStage.mutate({ id: job.id, stage: s })}
                    onMoveWon={() => moveStage.mutate({ id: job.id, stage: 'won' })}
                    onMoveLost={() => setPendingLost(job.id)}
                    onAssignMe={() =>
                      updateJob.mutate({ id: job.id, patch: { assigned_to: session?.user.id ?? null } })
                    }
                    onDelete={() => {
                      if (window.confirm(`Delete "${job.title}"?\nThis cannot be undone.`))
                        archiveJob.mutate([job.id])
                    }}
                    onToggleFollowUp={() => toggleFollowUp.mutate({ id: job.id, value: !job.follow_up })}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
      {rubberBand && createPortal(
        <div
          style={{
            position: 'fixed',
            left: Math.min(rubberBand.x1, rubberBand.x2),
            top: Math.min(rubberBand.y1, rubberBand.y2),
            width: Math.abs(rubberBand.x2 - rubberBand.x1),
            height: Math.abs(rubberBand.y2 - rubberBand.y1),
            border: '2px solid #d97706',
            backgroundColor: 'rgba(251,191,36,0.12)',
            borderRadius: 4,
            pointerEvents: 'none',
            zIndex: 9999,
          }}
        />,
        document.body,
      )}
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
  selectionMode,
  selected,
  onToggleSelect,
  onDragStart,
  onDragEnd,
  stages,
  onMoveStage,
  onMoveWon,
  onMoveLost,
  onAssignMe,
  onDelete,
  onToggleFollowUp,
}: {
  job: JobListRow
  dragging: boolean
  detailPath: string
  selectionMode: boolean
  selected: boolean
  onToggleSelect: (shift: boolean) => void
  onDragStart: () => void
  onDragEnd: () => void
  stages: JobStage[]
  onMoveStage: (stage: JobStage) => void
  onMoveWon: () => void
  onMoveLost: () => void
  onAssignMe: () => void
  onDelete: () => void
  onToggleFollowUp: () => void
}) {
  const install = installDate(job)
  const navigate = useNavigate()
  const menuBtnRef = useRef<HTMLButtonElement>(null)
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null)
  useEffect(() => {
    if (!menuPos) return
    const close = () => setMenuPos(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [menuPos])

  const openMenu = (e: React.MouseEvent) => {
    e.stopPropagation()
    const rect = menuBtnRef.current?.getBoundingClientRect()
    if (!rect) return
    setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
  }

  return (
    <div
      draggable={!selectionMode}
      onClick={(e) => {
        if (selectionMode) { onToggleSelect(e.shiftKey); return }
        void navigate(`${detailPath}/${job.id}`)
      }}
      onDragStart={(e) => {
        if (selectionMode) { e.preventDefault(); return }
        // Safari refuses to start a drag without data; keep it text/plain.
        e.dataTransfer.setData('text/plain', job.id)
        e.dataTransfer.effectAllowed = 'move'
        onDragStart()
      }}
      onDragEnd={onDragEnd}
      data-card-id={job.id}
      className={`relative cursor-pointer rounded border p-3.5 shadow-sm transition-shadow hover:shadow ${
        selected
          ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-400'
          : job.close_grade
          ? CLOSE_GRADE_STYLES[job.close_grade]
          : 'border-stone-200 bg-white hover:border-amber-300'
      } ${dragging ? 'opacity-40' : ''}`}
    >
      {selectionMode && (
        <span
          className={`absolute left-2 top-2 flex h-4 w-4 items-center justify-center rounded border-2 ${
            selected ? 'border-amber-500 bg-amber-500' : 'border-stone-300 bg-white'
          }`}
          aria-hidden
        >
          {selected && (
            <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1.5 4.5l2 2 4-4"/>
            </svg>
          )}
        </span>
      )}
      {/* Row 1: job number + value + menu */}
      <div className="flex items-center justify-between gap-2">
        <Link
          to={`${detailPath}/${job.id}`}
          draggable={false}
          className="text-xs font-semibold text-stone-400 hover:text-amber-700 hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {job.job_number}
        </Link>
        <div className="flex items-center gap-1">
          <div className="text-right">
            <div className="text-sm font-semibold tabular-nums text-stone-900">
              {job.margin_grade && (
                <span className="mr-1 font-bold text-amber-600" title={`Margin potential ${job.margin_grade}/5`}>
                  {marginSigns(job.margin_grade)}
                </span>
              )}
              {formatCurrency(job.value_final ?? job.value_est)}
            </div>
            {(job.profit_final ?? job.profit_est) != null && (() => {
              const profit = job.profit_final ?? job.profit_est
              const margin = calcMargin(profit, job.value_final ?? job.value_est)
              return (
                <div className="text-xs tabular-nums text-emerald-600">
                  {formatCurrency(profit)} profit
                  {margin != null && (
                    <span className={`ml-1 font-medium ${marginColor(margin)}`}>{margin}%</span>
                  )}
                </div>
              )
            })()}
          </div>
          <button
            ref={menuBtnRef}
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={openMenu}
            title="Quick actions"
            aria-label="Quick actions"
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-stone-300 hover:bg-stone-100 hover:text-stone-600"
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="currentColor">
              <circle cx="6.5" cy="2.5" r="1.2"/>
              <circle cx="6.5" cy="6.5" r="1.2"/>
              <circle cx="6.5" cy="10.5" r="1.2"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Row 2: title (First Name - City) */}
      <p className="mt-1.5 truncate font-medium text-stone-900">{job.title}</p>

      {/* Row 3: summary (3–4 word job description) */}
      {job.summary && (
        <p className="truncate text-xs text-stone-500">{job.summary}</p>
      )}

      {/* Row 4: contact name + phone + unconfirmed badge */}
      <div className="mt-1 flex items-baseline justify-between gap-2">
        <span className="flex items-center gap-1 truncate text-xs text-stone-600">
          {job.contact?.full_name ?? '—'}
          {job.contact && !job.contact.confirmed && (
            <span className="rounded bg-orange-100 px-1 py-0.5 text-xs font-medium text-orange-700">
              Unconfirmed
            </span>
          )}
        </span>
        {job.contact?.phone && (
          <span className="shrink-0 text-xs tabular-nums text-stone-400">{job.contact.phone}</span>
        )}
      </div>

      {/* Row 5: payments + install date + assignee */}
      <div className="mt-1 flex items-center justify-between text-xs text-stone-400">
        <div className="flex items-center gap-1.5">
          <PaymentDot label="D" paid={job.deposit_paid} />
          <PaymentDot label="B" paid={job.balance_paid} />
          {install && <span className="ml-0.5">· Install {formatDate(install)}</span>}
          {job.follow_up && (
            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-semibold text-emerald-700">
              Follow up
            </span>
          )}
        </div>
        <span className="truncate pl-2 text-right">{job.assignee?.full_name ?? ''}</span>
      </div>

      {menuPos && createPortal(
        <div
          style={{ top: menuPos.top, right: menuPos.right }}
          onClick={(e) => e.stopPropagation()}
          className="fixed z-50 w-44 overflow-hidden rounded-lg border border-stone-200 bg-white py-1 shadow-xl"
        >
          <CardMenuItem
            onClick={() => { setMenuPos(null); void navigate(`${detailPath}/${job.id}`) }}
            icon={<svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 11L11 2M11 2H6M11 2V7"/></svg>}
            label="Open detail"
          />
          <div className="my-1 border-t border-stone-100" />
          {stages.filter((s) => s !== job.stage && s !== 'lost').map((s) => (
            <CardMenuItem
              key={s}
              onClick={() => { setMenuPos(null); onMoveStage(s) }}
              icon={<svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M2 6.5h9M7.5 3l3.5 3.5L7.5 10"/></svg>}
              label={`→ ${STAGE_LABELS[s] ?? s}`}
              className={s === 'won' ? 'text-emerald-700 hover:bg-emerald-50' : ''}
            />
          ))}
          <div className="my-1 border-t border-stone-100" />
          <CardMenuItem
            onClick={() => { setMenuPos(null); onMoveWon() }}
            icon={<svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M2 7l3 3 6-6"/></svg>}
            label="Mark won"
            className="text-emerald-700 hover:bg-emerald-50"
          />
          <CardMenuItem
            onClick={() => { setMenuPos(null); onMoveLost() }}
            icon={<svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2.5 2.5l8 8M10.5 2.5l-8 8"/></svg>}
            label="Mark lost"
          />
          <CardMenuItem
            onClick={() => { setMenuPos(null); onAssignMe() }}
            icon={<svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><circle cx="6.5" cy="4" r="2.3"/><path d="M1.5 11.5c0-2.5 2.2-4.5 5-4.5s5 2 5 4.5"/></svg>}
            label="Assign to me"
          />
          <CardMenuItem
            onClick={() => { setMenuPos(null); onToggleFollowUp() }}
            icon={<svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6.5 1v2M6.5 10v2M1 6.5h2M10 6.5h2M2.9 2.9l1.4 1.4M8.7 8.7l1.4 1.4M2.9 10.1l1.4-1.4M8.7 4.3l1.4-1.4"/><circle cx="6.5" cy="6.5" r="2"/></svg>}
            label={job.follow_up ? 'Clear follow up' : 'Mark follow up'}
            className={job.follow_up ? 'text-emerald-700 hover:bg-emerald-50' : ''}
          />
          <div className="my-1 border-t border-stone-100" />
          <CardMenuItem
            onClick={() => { setMenuPos(null); onDelete() }}
            icon={<svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M2 3.5h9M5 3.5V2.5h3v1M4 3.5v7M6.5 3.5v7M9 3.5v7"/></svg>}
            label="Delete"
            danger
          />
        </div>,
        document.body,
      )}
    </div>
  )
}

function PaymentDot({ label, paid }: { label: string; paid: boolean }) {
  return (
    <span
      title={`${label === 'D' ? 'Deposit' : 'Balance'} ${paid ? 'paid' : 'unpaid'}`}
      className={`inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-xs font-semibold ${
        paid ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-100 text-stone-400'
      }`}
    >
      {label}
      {paid ? (
        <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1.5 4.5l2 2 4-4"/>
        </svg>
      ) : (
        <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <path d="M2 2l5 5M7 2L2 7"/>
        </svg>
      )}
    </span>
  )
}

function CardMenuItem({
  onClick,
  icon,
  label,
  danger,
  className,
}: {
  onClick: () => void
  icon: React.ReactNode
  label: string
  danger?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm ${
        danger
          ? 'text-red-600 hover:bg-red-50'
          : className ?? 'text-stone-700 hover:bg-stone-50'
      }`}
    >
      <span className="shrink-0 text-current">{icon}</span>
      {label}
    </button>
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

  const [rows, setRows] = useState<StageSetting[]>(() => {
    // Base: stages that belong to this phase/pipeline
    const base = settings
      .filter((s) =>
        phase === 'production'
          ? s.pipeline_id === null
          : s.pipeline_id === pipelineId,
      )
      .map((s) => ({ ...s }))

    // Pipeline dialog also needs won (it lives in production settings but is a pipeline terminal).
    // Explicitly look it up from settings and append if not already present.
    if (phase === 'pipeline') {
      const wonRow = settings.find((s) => s.stage === 'won')
      if (wonRow && !base.find((r) => r.stage === 'won')) {
        base.push({ ...wonRow })
      }
    }
    return base
  })

  // Drag order: visible stage keys sorted by current position
  const [order, setOrder] = useState<string[]>(() => {
    const visible = rows
      .filter((r) => !(r.stage.startsWith('custom_') && r.hidden))
      .sort((a, b) => a.position - b.position)
    // Production dialog: all production stages. Pipeline: pipeline + won.
    const relevant =
      phase === 'pipeline' ? visible.filter((r) => r.phase === 'pipeline' || r.stage === 'won') : visible
    return relevant.map((r) => r.stage)
  })

  const [dragging, setDragging] = useState<string | null>(null)

  const orderedRows = order
    .map((stage) => rows.find((r) => r.stage === stage))
    .filter((r): r is StageSetting => !!r)

  const onDragStart = (e: React.DragEvent, stage: string) => {
    e.dataTransfer.effectAllowed = 'move'
    setDragging(stage)
  }

  const onDragOver = (e: React.DragEvent, target: string) => {
    e.preventDefault()
    if (!dragging || dragging === target) return
    setOrder((prev) => {
      const from = prev.indexOf(dragging)
      const to = prev.indexOf(target)
      if (from < 0 || to < 0 || from === to) return prev
      const next = [...prev]
      next.splice(from, 1)
      next.splice(to, 0, dragging)
      return next
    })
  }

  const onDrop = (e: React.DragEvent) => { e.preventDefault(); setDragging(null) }
  const onDragEnd = () => setDragging(null)

  const setLabel = (stage: string, v: string) =>
    setRows((r) => r.map((s) => (s.stage === stage ? { ...s, label: v } : s)))
  const setHidden = (stage: string, v: boolean) =>
    setRows((r) => r.map((s) => (s.stage === stage ? { ...s, hidden: v } : s)))

  const submit = () => {
    // Sequential positions based on current drag order — same logic for both phases.
    // Won's position is shared between pipeline and Jobs; moving it here moves it there too.
    const posMap = new Map(order.map((s, i): [string, number] => [s, i]))
    const cleaned = rows.map((r) => ({
      ...r,
      label: r.label.trim() || r.stage,
      position: posMap.has(r.stage) ? posMap.get(r.stage)! : r.position,
    }))
    save.mutate(cleaned, { onSuccess: onClose })
  }

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-lg bg-white p-4 shadow-xl sm:p-6">
        <h2 className="mb-1 text-lg font-semibold text-stone-900">
          Customize {phase === 'pipeline' ? 'Pipeline' : 'Jobs'} stages
        </h2>
        <p className="mb-4 text-xs text-stone-500">
          Drag to reorder. Rename or hide columns. Hidden stages still appear while they hold jobs.
          {phase === 'pipeline' && <> <span className="font-medium text-amber-700">Position 1</span> is where new sheet-imported leads land. Won is shared — its position also affects the Jobs board.</>}
        </p>
        <ul className="space-y-1.5">
          {orderedRows.map((row, i) => (
              <li
                key={row.stage}
                draggable
                onDragStart={(e) => onDragStart(e, row.stage)}
                onDragOver={(e) => onDragOver(e, row.stage)}
                onDrop={onDrop}
                onDragEnd={onDragEnd}
                className={`flex items-center gap-2 rounded-lg border p-1.5 transition-opacity ${
                  dragging === row.stage ? 'opacity-40' : ''
                } ${row.hidden ? 'bg-stone-50 opacity-60' : 'border-transparent hover:border-stone-200 hover:bg-stone-50'} cursor-grab active:cursor-grabbing`}
              >
                <span className="w-5 shrink-0 text-center text-xs font-semibold tabular-nums text-stone-400 select-none">
                  {i + 1}
                </span>
                {phase === 'pipeline' && i === 0 && (
                  <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700">
                    new leads land here
                  </span>
                )}
                <span
                  className="flex flex-col gap-[3px] px-1 select-none opacity-40 hover:opacity-70 cursor-grab"
                  aria-hidden="true"
                >
                  <span className="block h-0.5 w-4 rounded bg-stone-500" />
                  <span className="block h-0.5 w-4 rounded bg-stone-500" />
                  <span className="block h-0.5 w-4 rounded bg-stone-500" />
                </span>
                <input
                  value={row.label}
                  onChange={(e) => setLabel(row.stage, e.target.value)}
                  className="flex-1 rounded border border-stone-300 px-2 py-1.5 text-sm focus:border-amber-600 focus:outline-none"
                />
                <label className="flex cursor-pointer items-center gap-1 text-xs text-stone-500">
                  <input
                    type="checkbox"
                    checked={row.hidden}
                    onChange={(e) => setHidden(row.stage, e.target.checked)}
                    className="h-3.5 w-3.5 accent-amber-600"
                  />
                  {row.hidden ? <span className="text-amber-700">hidden</span> : 'hide'}
                </label>
              </li>
          ))}
        </ul>
        {rows.some((r) => r.stage.startsWith('custom_') && r.hidden) && (
          <button
            onClick={() => {
              const next = rows.find((r) => r.stage.startsWith('custom_') && r.hidden)
              if (!next) return
              const name = window.prompt('Name for the new column:', '')
              if (!name?.trim()) return
              setRows((r) =>
                r.map((s) =>
                  s.stage === next.stage
                    ? { ...s, hidden: false, label: name.trim(), phase }
                    : s,
                ),
              )
              setOrder((prev) => [...prev, next.stage])
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
