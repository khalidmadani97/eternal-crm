import { useEffect, useState } from 'react'
import { LeadSheetsDialog } from '../../leads/components/LeadSheetsDialog'
import { useLeadSheets, useSyncLeadSheets } from '../../leads/api'
import { useWorkspaceStages } from '../api'
import { JobsTable } from '../components/JobsTable'
import { StageBoard } from '../components/StageBoard'

type View = 'board' | 'list'

/** Leads workspace (Slice 27, GHL-style): board or list. Winning a lead
 *  moves it to the Jobs workspace automatically — membership is the stage. */
export function PipelinePage() {
  const [view, setView] = useState<View>('board')
  const [showSources, setShowSources] = useState(false)
  const stages = useWorkspaceStages('pipeline')
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
        <p className="text-xs text-stone-400">Win a lead and it moves to Jobs.</p>
        <button
          onClick={() => setShowSources(true)}
          className="ml-auto rounded border border-stone-300 px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-50"
        >
          ⚡ Lead sources
          {hasSheets && sheets?.some((s) => s.last_error) && (
            <span className="ml-1.5 text-red-600">!</span>
          )}
        </button>
      </div>
      {view === 'board' ? (
        <StageBoard stages={stages} detailPath="/leads" phase="pipeline" />
      ) : (
        <JobsTable stages={stages} newJobStage="new" newJobLabel="New lead" detailPath="/leads" />
      )}
      {showSources && <LeadSheetsDialog onClose={() => setShowSources(false)} />}
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
