import { useEffect, useState } from 'react'
import { LeadSheetsDialog } from '../../leads/components/LeadSheetsDialog'
import { useLeadSheets, useSyncLeadSheets } from '../../leads/api'
import { useCreatePipeline, usePipelines, useWorkspaceStages } from '../api'
import { NewJobDialog } from '../components/NewJobDialog'
import { JobsTable } from '../components/JobsTable'
import { StageBoard } from '../components/StageBoard'

type View = 'board' | 'list'

/** Leads workspace (Slice 27, GHL-style): board or list. Winning a lead
 *  moves it to the Jobs workspace automatically — membership is the stage. */
export function PipelinePage() {
  const [view, setView] = useState<View>('board')
  const [showSources, setShowSources] = useState(false)
  const [showNewLead, setShowNewLead] = useState(false)
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
      {view === 'board' ? (
        <StageBoard
          stages={stages}
          detailPath="/leads"
          phase="pipeline"
          pipelineId={currentPipeline?.id ?? null}
          isDefaultPipeline={isDefaultPipeline}
        />
      ) : (
        <JobsTable
          stages={stages}
          newJobStage="new"
          newJobLabel="New lead"
          detailPath="/leads"
          pipelineId={currentPipeline?.id ?? null}
          isDefaultPipeline={isDefaultPipeline}
        />
      )}
      {showSources && <LeadSheetsDialog onClose={() => setShowSources(false)} />}
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

export function ViewToggle({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  return (
    <div className="flex rounded border border-stone-300 text-sm">
      {(['board', 'list'] as View[]).map((v) => (
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
