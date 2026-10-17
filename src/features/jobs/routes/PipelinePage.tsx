import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LeadSheetsDialog } from '../../leads/components/LeadSheetsDialog'
import { useLeadSheets, useSearchLeads, useSyncLeadSheets } from '../../leads/api'
import { useCreatePipeline, usePipelines, useWorkspaceStages } from '../api'

import { NewJobDialog } from '../components/NewJobDialog'
import { JobsTable } from '../components/JobsTable'
import { StageBoard } from '../components/StageBoard'
import { ArchivedJobsTable } from '../components/ArchivedJobsTable'
import { BulkUploadDialog } from '../../leads/components/BulkUploadDialog'

type View = 'board' | 'list' | 'archived'

/** Leads workspace (Slice 27, GHL-style): board or list. Winning a lead
 *  moves it to the Jobs workspace automatically — membership is the stage. */
export function PipelinePage() {
  const [view, setView] = useState<View>('board')
  const [showSources, setShowSources] = useState(false)
  const [showNewLead, setShowNewLead] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const { data: pipelines } = usePipelines()
  const createPipeline = useCreatePipeline()
  const [activePipelineId, setActivePipelineId] = useState<string | null>(null)
  const currentPipeline =
    pipelines?.find((p) => p.id === activePipelineId) ?? pipelines?.[0] ?? null
  const isDefaultPipeline = currentPipeline?.id === pipelines?.[0]?.id
  const stages = useWorkspaceStages('pipeline', currentPipeline?.id ?? null)
  const { data: sheets } = useLeadSheets()
  const sync = useSyncLeadSheets()

  // "Live" sheets: auto-sync when the pipeline opens and every 3 minutes
  // while it stays open.
  const hasSheets = (sheets?.length ?? 0) > 0
  const syncMutate = sync.mutate
  useEffect(() => {
    if (!hasSheets) return
    syncMutate(undefined)
    const timer = setInterval(() => syncMutate(undefined), 3 * 60_000)
    return () => clearInterval(timer)
  }, [hasSheets, syncMutate])

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold text-stone-900">Pipeline</h1>
        <ViewToggle view={view} onChange={setView} />
        <LeadSearchBox />
        <button
          onClick={() => setShowSources(true)}
          className="ml-auto rounded border border-stone-300 px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-50"
        >
          ⚡ Lead sources
          {hasSheets && sheets?.some((s) => s.last_error) && (
            <span className="ml-1.5 text-red-600">!</span>
          )}
        </button>
        <button
          onClick={() => setShowUpload(true)}
          className="rounded border border-stone-300 px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-50"
        >
          ↑ Upload CSV/XLSX
        </button>
        <button
          onClick={() => setShowNewLead(true)}
          className="rounded bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800"
        >
          + New lead
        </button>
      </div>
      {pipelines && (
        <div className="mb-3 flex flex-wrap items-center gap-1 border-b border-stone-200">
          {pipelines.map((p) => (
            <button
              key={p.id}
              onClick={() => setActivePipelineId(p.id)}
              className={`-mb-px border-b-2 px-3 py-1.5 text-sm font-medium ${
                currentPipeline?.id === p.id
                  ? 'border-amber-600 text-stone-900'
                  : 'border-transparent text-stone-500 hover:text-stone-800'
              }`}
            >
              {p.name}
            </button>
          ))}
          <button
            onClick={() => {
              const name = window.prompt('Name for the new pipeline:', '')
              if (name?.trim())
                createPipeline.mutate(name.trim(), {
                  onSuccess: (id) => setActivePipelineId(id as string),
                })
            }}
            disabled={createPipeline.isPending}
            className="-mb-px px-3 py-1.5 text-sm text-stone-400 hover:text-stone-700 disabled:opacity-50"
          >
            {createPipeline.isPending ? 'Creating…' : '+ New pipeline'}
          </button>
          {createPipeline.isError && (
            <span className="text-xs text-red-600">{createPipeline.error.message}</span>
          )}
          <span className="ml-auto pb-1 text-xs text-stone-400">Win a lead and it moves to Jobs.</span>
        </div>
      )}
      {view === 'board' && (
        <StageBoard
          stages={stages}
          detailPath="/leads"
          phase="pipeline"
          pipelineId={currentPipeline?.id ?? null}
          isDefaultPipeline={isDefaultPipeline}
        />
      )}
      {view === 'list' && (
        <JobsTable
          stages={stages}
          newJobStage="new"
          newJobLabel="New lead"
          detailPath="/leads"
          pipelineId={currentPipeline?.id ?? null}
          isDefaultPipeline={isDefaultPipeline}
        />
      )}
      {view === 'archived' && (
        <ArchivedJobsTable
          stages={stages}
          detailPath="/leads"
          pipelineId={currentPipeline?.id ?? null}
          isDefaultPipeline={isDefaultPipeline}
        />
      )}
      {showSources && <LeadSheetsDialog onClose={() => setShowSources(false)} />}
      {showUpload && (
        <BulkUploadDialog
          stages={stages}
          pipelineId={currentPipeline?.id ?? null}
          onClose={() => setShowUpload(false)}
        />
      )}
      {showNewLead && (
        <NewJobDialog
          initialStage="new"
          pipelineId={currentPipeline?.id ?? null}
          onClose={() => setShowNewLead(false)}
        />
      )}
    </div>
  )
}

function LeadSearchBox() {
  const [term, setTerm] = useState('')
  const [open, setOpen] = useState(false)
  const { data: results, isFetching } = useSearchLeads(term)
  const navigate = useNavigate()
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const go = (id: string) => {
    setTerm('')
    setOpen(false)
    void navigate(`/leads/${id}`)
  }

  return (
    <div ref={boxRef} className="relative">
      <input
        type="search"
        value={term}
        onChange={(e) => { setTerm(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder="Search leads…"
        className="w-44 rounded border border-stone-300 bg-white px-3 py-1.5 text-sm focus:border-amber-600 focus:outline-none sm:w-56"
      />
      {open && term.trim().length >= 2 && (
        <div className="absolute left-0 top-full z-50 mt-1 w-80 overflow-hidden rounded-lg border border-stone-200 bg-white shadow-xl">
          {isFetching && (
            <p className="px-3 py-2 text-sm text-stone-400">Searching…</p>
          )}
          {!isFetching && (!results || results.length === 0) && (
            <p className="px-3 py-2 text-sm text-stone-400">No leads found.</p>
          )}
          {results?.map((r) => (
            <button
              key={r.jobId}
              onMouseDown={() => go(r.jobId)}
              className="flex w-full flex-col px-3 py-2.5 text-left hover:bg-amber-50"
            >
              <span className="text-sm font-medium text-stone-900">
                {r.parsedName ?? r.title}
              </span>
              <span className="text-xs text-stone-400">
                {r.jobNumber}
                {r.parsedPhone && ` · ${r.parsedPhone}`}
                {r.title && r.parsedName && r.title !== r.parsedName && (
                  <> · {r.title}</>
                )}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function ViewToggle({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  return (
    <div className="flex rounded border border-stone-300 text-sm">
      {(['board', 'list', 'archived'] as View[]).map((v) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`px-3 py-1 capitalize ${view === v ? 'bg-stone-900 text-white' : 'hover:bg-stone-50'}`}
        >
          {v}
        </button>
      ))}
    </div>
  )
}
