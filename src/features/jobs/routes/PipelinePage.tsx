import { useState } from 'react'
import { PIPELINE_STAGES } from '../api'
import { JobsTable } from '../components/JobsTable'
import { StageBoard } from '../components/StageBoard'

type View = 'board' | 'list'

/** Leads workspace (Slice 27, GHL-style): board or list. Winning a lead
 *  moves it to the Jobs workspace automatically — membership is the stage. */
export function PipelinePage() {
  const [view, setView] = useState<View>('board')
  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-center gap-3">
        <h1 className="text-xl font-semibold text-stone-900">Pipeline</h1>
        <ViewToggle view={view} onChange={setView} />
        <p className="text-xs text-stone-400">Win a lead and it moves to Jobs.</p>
      </div>
      {view === 'board' ? (
        <StageBoard stages={PIPELINE_STAGES} />
      ) : (
        <JobsTable stages={PIPELINE_STAGES} newJobStage="new" newJobLabel="New lead" />
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
