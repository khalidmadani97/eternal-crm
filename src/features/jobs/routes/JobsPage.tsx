import { useState } from 'react'
import { PRODUCTION_STAGES } from '../api'
import { JobsTable } from '../components/JobsTable'
import { StageBoard } from '../components/StageBoard'
import { ViewToggle } from './PipelinePage'

/** Production workspace (Slice 27): everything won and beyond, as a list or
 *  a board. */
export function JobsPage() {
  const [view, setView] = useState<'board' | 'list'>('list')
  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-center gap-3">
        <h1 className="text-xl font-semibold text-stone-900">Jobs</h1>
        <ViewToggle view={view} onChange={setView} />
      </div>
      {view === 'board' ? (
        <StageBoard stages={PRODUCTION_STAGES} />
      ) : (
        <JobsTable stages={PRODUCTION_STAGES} newJobStage="won" newJobLabel="New job" />
      )}
    </div>
  )
}
