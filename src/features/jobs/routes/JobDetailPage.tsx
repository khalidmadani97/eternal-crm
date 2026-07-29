import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useProfiles } from '../../auth/api'
import { formatCurrency } from '../../../lib/format'
import { JOB_STAGES, useJob, useUpdateJob } from '../api'
import type { JobDetail, JobStage } from '../api'
import { CommsThread } from '../../comms/components/CommsThread'
import { JobContracts } from '../../contracts/components/JobContracts'
import { JobQuotes } from '../../quotes/components/JobQuotes'
import { JobAppointments } from '../../schedule/components/JobAppointments'
import { ActivityTimeline } from '../components/ActivityTimeline'
import { JobFiles } from '../components/JobFiles'
import { JobTasks } from '../components/JobTasks'
import { LostReasonDialog } from '../components/LostReasonDialog'
import { StageBadge, STAGE_LABELS } from '../components/StageBadge'

export function JobDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: job, isPending, isError, error, refetch } = useJob(id!)

  if (isPending) return <p className="py-12 text-center text-stone-500">Loading job…</p>
  if (isError)
    return (
      <div className="py-12 text-center">
        <p className="mb-2 text-red-600">Could not load the job. {error.message}</p>
        <button
          onClick={() => void refetch()}
          className="rounded border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-50"
        >
          Retry
        </button>
      </div>
    )

  return (
    <div>
      <Link to="/jobs" className="text-sm text-stone-500 hover:text-stone-800">
        ← Jobs
      </Link>
      <JobHeader job={job} />
      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          <JobDetailsForm job={job} />
          {job.contact && (
            <CommsThread
              contactId={job.contact.id}
              contactName={job.contact.full_name}
              contactPhone={job.contact.phone}
              jobId={job.id}
            />
          )}
          <ActivityTimeline jobId={job.id} />
        </div>
        <div className="space-y-4">
          <JobAppointments jobId={job.id} />
          <JobQuotes jobId={job.id} />
          <JobContracts job={job} />
          <JobTasks jobId={job.id} />
          <JobFiles jobId={job.id} />
        </div>
      </div>
    </div>
  )
}

function JobHeader({ job }: { job: JobDetail }) {
  const updateJob = useUpdateJob()
  const [pendingLost, setPendingLost] = useState(false)

  const changeStage = (stage: JobStage) => {
    if (stage === job.stage) return
    if (stage === 'lost') {
      setPendingLost(true)
      return
    }
    updateJob.mutate({ id: job.id, patch: { stage } })
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
      <h1 className="text-xl font-semibold text-stone-900">
        <span className="text-stone-400">{job.job_number}</span> {job.title}
      </h1>
      <StageBadge stage={job.stage} />
      <select
        value={job.stage}
        onChange={(e) => changeStage(e.target.value as JobStage)}
        className="rounded border border-stone-300 bg-white px-2 py-1 text-sm"
      >
        {JOB_STAGES.map((s) => (
          <option key={s} value={s}>
            {STAGE_LABELS[s]}
          </option>
        ))}
      </select>
      {updateJob.isError && (
        <span className="text-sm text-red-600">Stage change failed. {updateJob.error.message}</span>
      )}
      <span className="text-sm text-stone-600">
        {job.contact ? (
          <Link to={`/contacts/${job.contact.id}`} className="text-amber-700 hover:underline">
            {job.contact.full_name}
          </Link>
        ) : (
          '—'
        )}
        {job.company && (
          <>
            {' · '}
            <Link to={`/companies/${job.company.id}`} className="text-amber-700 hover:underline">
              {job.company.name}
            </Link>
          </>
        )}
      </span>
      <span className="ml-auto text-lg font-medium tabular-nums text-stone-900">
        {formatCurrency(job.value_final ?? job.value_est)}
      </span>
      {pendingLost && (
        <LostReasonDialog
          onCancel={() => setPendingLost(false)}
          onConfirm={(reason) => {
            updateJob.mutate({ id: job.id, patch: { stage: 'lost', lost_reason: reason } })
            setPendingLost(false)
          }}
        />
      )}
    </div>
  )
}

function JobDetailsForm({ job }: { job: JobDetail }) {
  const updateJob = useUpdateJob()
  const { data: profiles } = useProfiles()
  const [form, setForm] = useState({
    title: job.title,
    site_address: job.site_address ?? '',
    value_est: job.value_est?.toString() ?? '',
    value_final: job.value_final?.toString() ?? '',
    lead_source: job.lead_source ?? '',
    assigned_to: job.assignee?.id ?? '',
  })
  const [saved, setSaved] = useState(false)

  const save = async () => {
    if (!form.title.trim()) return
    for (const v of [form.value_est, form.value_final]) {
      if (v && Number.isNaN(Number(v))) return
    }
    await updateJob.mutateAsync({
      id: job.id,
      patch: {
        title: form.title.trim(),
        site_address: form.site_address.trim() || null,
        value_est: form.value_est ? Number(form.value_est) : null,
        value_final: form.value_final ? Number(form.value_final) : null,
        lead_source: form.lead_source.trim() || null,
        assigned_to: form.assigned_to || null,
      },
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const field = (label: string, input: React.ReactNode) => (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-stone-700">{label}</span>
      {input}
    </label>
  )
  const inputClass =
    'w-full rounded border border-stone-300 px-3 py-2 text-sm focus:border-amber-600 focus:outline-none'

  return (
    <section className="rounded-lg border border-stone-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">Details</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {field(
          'Title',
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className={inputClass}
          />,
        )}
        {field(
          'Site address',
          <input
            value={form.site_address}
            onChange={(e) => setForm({ ...form, site_address: e.target.value })}
            className={inputClass}
          />,
        )}
        {field(
          'Estimated value ($)',
          <input
            inputMode="decimal"
            value={form.value_est}
            onChange={(e) => setForm({ ...form, value_est: e.target.value })}
            className={inputClass}
          />,
        )}
        {field(
          'Final value ($)',
          <input
            inputMode="decimal"
            value={form.value_final}
            onChange={(e) => setForm({ ...form, value_final: e.target.value })}
            className={inputClass}
          />,
        )}
        {field(
          'Lead source',
          <input
            value={form.lead_source}
            onChange={(e) => setForm({ ...form, lead_source: e.target.value })}
            className={inputClass}
          />,
        )}
        {field(
          'Assigned to',
          <select
            value={form.assigned_to}
            onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}
            className={inputClass}
          >
            <option value="">Unassigned</option>
            {profiles?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name ?? 'Unnamed'}
              </option>
            ))}
          </select>,
        )}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={() => void save()}
          disabled={updateJob.isPending || !form.title.trim()}
          className="rounded bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
        >
          {updateJob.isPending ? 'Saving…' : 'Save'}
        </button>
        {saved && <span className="text-sm text-emerald-700">Saved.</span>}
        {updateJob.isError && (
          <span className="text-sm text-red-600">Save failed. {updateJob.error.message}</span>
        )}
      </div>
    </section>
  )
}
