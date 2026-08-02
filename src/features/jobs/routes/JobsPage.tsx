import { useState } from 'react'
import { useWorkspaceStages } from '../api'
import { JobsTable } from '../components/JobsTable'
import { StageBoard } from '../components/StageBoard'
import { ViewToggle } from './PipelinePage'

/** Production workspace (Slice 27): everything won and beyond, as a list or
 *  a board. */
export function JobsPage() {
  const [view, setView] = useState<'board' | 'list'>('list')
  const stages = useWorkspaceStages('production')
  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-center gap-3">
        <h1 className="text-xl font-semibold text-stone-900">Jobs</h1>
        <ViewToggle view={view} onChange={setView} />
      </div>
      {view === 'board' ? (
        <StageBoard stages={stages} />
      ) : (
        <JobsTable stages={stages} newJobStage="won" newJobLabel="New job" />
      )}
    </div>
  )
}
