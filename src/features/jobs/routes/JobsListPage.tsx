import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useProfiles } from '../../auth/api'
import { formatCurrency, formatDate } from '../../../lib/format'
import { installDate, JOB_STAGES, useJobs } from '../api'
import type { JobListRow, JobStage } from '../api'
import { NewJobDialog } from '../components/NewJobDialog'
import { StageBadge, STAGE_LABELS } from '../components/StageBadge'

type SortKey = 'created' | 'install' | 'value'

export function JobsListPage() {
  const { data: jobs, isPending, isError, error, refetch } = useJobs()
  const { data: profiles } = useProfiles()
  const [stageFilter, setStageFilter] = useState<JobStage | 'all'>('all')
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all')
  const [sourceFilter, setSourceFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('created')
  const [showNewJob, setShowNewJob] = useState(false)

  const leadSources = useMemo(() => {
    const set = new Set<string>()
    jobs?.forEach((j) => j.lead_source && set.add(j.lead_source))
    return [...set].sort()
  }, [jobs])

  const visible = useMemo(() => {
    if (!jobs) return []
    const term = search.trim().toLowerCase()
    const filtered = jobs.filter((j) => {
      if (stageFilter !== 'all' && j.stage !== stageFilter) return false
      if (assigneeFilter === 'none' && j.assignee) return false
      if (assigneeFilter !== 'all' && assigneeFilter !== 'none' && j.assignee?.id !== assigneeFilter)
        return false
      if (sourceFilter !== 'all' && j.lead_source !== sourceFilter) return false
      if (term) {
        const haystack = `${j.job_number} ${j.title} ${j.contact?.full_name ?? ''}`.toLowerCase()
        if (!haystack.includes(term)) return false
      }
      return true
    })
    return sortJobs(filtered, sortKey)
  }, [jobs, stageFilter, assigneeFilter, sourceFilter, search, sortKey])

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-stone-900">Jobs</h1>
        <button
          onClick={() => setShowNewJob(true)}
          className="rounded bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800"
        >
          New job
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          placeholder="Search job #, title, contact…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64 rounded border border-stone-300 bg-white px-3 py-1.5 text-sm focus:border-amber-600 focus:outline-none"
        />
        <select
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value as JobStage | 'all')}
          className="rounded border border-stone-300 bg-white px-2 py-1.5 text-sm"
        >
          <option value="all">All stages</option>
          {JOB_STAGES.map((s) => (
            <option key={s} value={s}>
              {STAGE_LABELS[s]}
            </option>
          ))}
        </select>
        <select
          value={assigneeFilter}
          onChange={(e) => setAssigneeFilter(e.target.value)}
          className="rounded border border-stone-300 bg-white px-2 py-1.5 text-sm"
        >
          <option value="all">All assignees</option>
          <option value="none">Unassigned</option>
          {profiles?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name ?? 'Unnamed'}
            </option>
          ))}
        </select>
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="rounded border border-stone-300 bg-white px-2 py-1.5 text-sm"
        >
          <option value="all">All lead sources</option>
          {leadSources.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="rounded border border-stone-300 bg-white px-2 py-1.5 text-sm"
        >
          <option value="created">Newest first</option>
          <option value="install">By install date</option>
          <option value="value">By value</option>
        </select>
      </div>

      {isPending && <p className="py-12 text-center text-stone-500">Loading jobs…</p>}
      {isError && (
        <div className="py-12 text-center">
          <p className="mb-2 text-red-600">Could not load jobs. {error.message}</p>
          <button
            onClick={() => void refetch()}
            className="rounded border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-50"
          >
            Retry
          </button>
        </div>
      )}
      {jobs && visible.length === 0 && (
        <p className="py-12 text-center text-stone-500">
          {jobs.length === 0 ? 'No jobs yet. Create the first one.' : 'No jobs match the filters.'}
        </p>
      )}

      {visible.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500">
                <th className="px-4 py-3">Job #</th>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Stage</th>
                <th className="px-4 py-3 text-right">Value</th>
                <th className="px-4 py-3">Install</th>
                <th className="px-4 py-3">Assigned</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((j) => (
                <tr key={j.id} className="border-b border-stone-100 last:border-0 hover:bg-stone-50">
                  <td className="px-4 py-3 font-medium">
                    <Link to={`/jobs/${j.id}`} className="text-stone-900 hover:text-amber-700 hover:underline">
                      {j.job_number}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link to={`/jobs/${j.id}`} className="hover:text-amber-700">
                      {j.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{j.contact?.full_name ?? '—'}</td>
                  <td className="px-4 py-3">{j.company?.name ?? '—'}</td>
                  <td className="px-4 py-3">
                    <StageBadge stage={j.stage} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatCurrency(j.value_final ?? j.value_est)}
                  </td>
                  <td className="px-4 py-3">{formatDate(installDate(j))}</td>
                  <td className="px-4 py-3">{j.assignee?.full_name ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showNewJob && <NewJobDialog onClose={() => setShowNewJob(false)} />}
    </div>
  )
}

function sortJobs(jobs: JobListRow[], key: SortKey): JobListRow[] {
  const copy = [...jobs]
  switch (key) {
    case 'created':
      return copy.sort((a, b) => b.created_at.localeCompare(a.created_at))
    case 'install':
      return copy.sort((a, b) => {
        const ia = installDate(a)
        const ib = installDate(b)
        if (ia === ib) return 0
        if (ia === null) return 1
        if (ib === null) return -1
        return ia.localeCompare(ib)
      })
    case 'value':
      return copy.sort(
        (a, b) => (Number(b.value_final ?? b.value_est) || 0) - (Number(a.value_final ?? a.value_est) || 0),
      )
  }
}
