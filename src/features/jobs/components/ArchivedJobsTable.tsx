import { Link, useNavigate } from 'react-router-dom'
import { formatCurrency, formatDate } from '../../../lib/format'
import { useArchivedJobs, useRestoreJob, installDate } from '../api'
import type { JobStage } from '../api'
import { StageBadge, useStageLabels } from './StageBadge'
import { useState } from 'react'

export function ArchivedJobsTable({
  stages,
  detailPath = '/jobs',
  pipelineId = null,
  isDefaultPipeline = true,
}: {
  stages: JobStage[]
  detailPath?: string
  pipelineId?: string | null
  isDefaultPipeline?: boolean
}) {
  const stageLabels = useStageLabels()
  const { data: allJobs, isPending, isError, error } = useArchivedJobs()
  const restore = useRestoreJob()
  const navigate = useNavigate()
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const jobs = allJobs?.filter((j) => {
    if (!stages.includes(j.stage)) return false
    if (!pipelineId) return true
    return j.pipeline_id === pipelineId || (isDefaultPipeline && j.pipeline_id === null)
  })

  const toggleSelected = (id: string) =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })

  if (isPending) return <p className="py-12 text-center text-stone-500">Loading archived…</p>
  if (isError) return <p className="py-12 text-center text-red-600">Could not load archived. {error.message}</p>
  if (!jobs || jobs.length === 0)
    return <p className="py-12 text-center text-stone-400">No archived records.</p>

  return (
    <div>
      {selected.size > 0 && (
        <div className="mb-3 flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2">
          <span className="text-sm font-medium text-amber-900">{selected.size} selected</span>
          <button
            onClick={() => {
              [...selected].forEach((id) => restore.mutate(id))
              setSelected(new Set())
            }}
            disabled={restore.isPending}
            className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            Restore selected
          </button>
          <button onClick={() => setSelected(new Set())} className="text-sm text-stone-500 hover:text-stone-800">
            Clear
          </button>
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500">
              <th className="w-10 px-3 py-3">
                <input
                  type="checkbox"
                  checked={jobs.length > 0 && jobs.every((j) => selected.has(j.id))}
                  onChange={(e) => setSelected(e.target.checked ? new Set(jobs.map((j) => j.id)) : new Set())}
                  className="h-4 w-4 accent-amber-600"
                  aria-label="Select all"
                />
              </th>
              <th className="px-4 py-3">Job #</th>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Stage</th>
              <th className="px-4 py-3 text-right">Value</th>
              <th className="px-4 py-3">Install</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => (
              <tr
                key={j.id}
                onClick={() => void navigate(`${detailPath}/${j.id}`)}
                className="cursor-pointer border-b border-stone-100 last:border-0 hover:bg-stone-50"
              >
                <td className="w-10 px-3 py-3" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selected.has(j.id)}
                    onChange={() => toggleSelected(j.id)}
                    className="h-4 w-4 accent-amber-600"
                  />
                </td>
                <td className="px-4 py-3 font-medium">
                  <Link to={`${detailPath}/${j.id}`} className="text-stone-900 hover:text-amber-700 hover:underline" onClick={(e) => e.stopPropagation()}>
                    {j.job_number}
                  </Link>
                </td>
                <td className="px-4 py-3 text-stone-500">{j.title}</td>
                <td className="px-4 py-3">{j.contact?.full_name ?? '—'}</td>
                <td className="px-4 py-3">
                  <StageBadge stage={j.stage} />
                  <span className="ml-1.5 text-xs text-stone-400">{stageLabels[j.stage]}</span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(j.value_final ?? j.value_est)}</td>
                <td className="px-4 py-3">{formatDate(installDate(j))}</td>
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => restore.mutate(j.id)}
                    disabled={restore.isPending}
                    className="text-xs font-medium text-emerald-700 hover:text-emerald-900 disabled:opacity-50"
                  >
                    Restore
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {restore.isError && <p className="mt-2 text-sm text-red-600">Restore failed. {restore.error.message}</p>}
    </div>
  )
}
