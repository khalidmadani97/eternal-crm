import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { OptionSelect } from '../../../components/OptionSelect'
import { useProfiles } from '../../auth/api'
import { formatCurrency, calcMargin } from '../../../lib/format'
import { useJob, useUpdateJob, useToggleFollowUp, useConfirmContact, useWorkspaceStages, useStageSettings } from '../api'
import type { JobDetail, JobStage } from '../api'
import { CommsThread } from '../../comms/components/CommsThread'
import { JobCosts } from '../../expenses/components/JobCosts'
import { JobContracts } from '../../contracts/components/JobContracts'
import { JobQuotes } from '../../quotes/components/JobQuotes'
import { ExtraFieldsEditor } from '../../../components/ExtraFieldsEditor'
import { LeadGrading } from '../../leads/components/LeadGrading'
import { LeadInfo } from '../../leads/components/LeadInfo'
import { LeadPayments } from '../../leads/components/LeadPayments'
import { JobAppointments } from '../../schedule/components/JobAppointments'
import { ActivityTimeline } from '../components/ActivityTimeline'
import { JobFiles } from '../components/JobFiles'
import { CallNotetaker } from '../components/CallNotetaker'
import { JobNextStep } from '../components/JobNextStep'
import { JobTasks } from '../components/JobTasks'
import { LostReasonDialog } from '../components/LostReasonDialog'
import { StageBadge, useStageLabels } from '../components/StageBadge'
import { useConversionQueue } from '../../settings/api'

export function JobDetailPage({ mode = 'job' }: { mode?: 'lead' | 'job' }) {
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
      <Link
        to={mode === 'lead' ? '/pipeline' : '/jobs'}
        className="text-sm text-stone-500 hover:text-stone-800"
      >
        {mode === 'lead' ? '← Pipeline' : '← Jobs'}
      </Link>
      <JobHeader job={job} mode={mode} />
      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          {mode === 'lead' && <LeadInfo job={job} />}
          {mode === 'lead' && <LeadPayments job={job} />}
          {mode === 'lead' && <LeadGrading job={job} />}
          {mode === 'lead' && <CallNotetaker jobId={job.id} contactId={job.contact?.id} />}
          {mode === 'lead' && <ActivityTimeline jobId={job.id} contactId={job.contact?.id} title="Notes" />}
          {mode === 'job' && <JobDetailsForm job={job} />}
          {job.contact && (
            <CommsThread
              contactId={job.contact.id}
              contactName={job.contact.full_name}
              contactPhone={job.contact.phone}
              jobId={job.id}
            />
          )}
          {mode === 'job' && <ActivityTimeline jobId={job.id} contactId={job.contact?.id} />}
          {mode === 'lead' && <JobDetailsForm job={job} />}
        </div>
        <div className="space-y-4">
          {mode === 'job' && <JobNextStep jobId={job.id} />}
          <JobAppointments jobId={job.id} />
          <JobQuotes jobId={job.id} />
          {mode === 'job' && <JobCosts jobId={job.id} />}
          <JobContracts job={job} />
          <JobTasks jobId={job.id} />
          <JobFiles jobId={job.id} />
        </div>
      </div>
    </div>
  )
}

function JobHeader({ job, mode }: { job: JobDetail; mode: 'lead' | 'job' }) {
  const updateJob = useUpdateJob()
  const toggleFollowUp = useToggleFollowUp()
  const confirmContact = useConfirmContact()
  const { data: stageSettings } = useStageSettings()
  const workspaceStages = useWorkspaceStages(
    mode === 'lead' ? 'pipeline' : 'production',
    mode === 'lead' ? (job.pipeline_id ?? null) : null,
  )
  const { data: conv } = useConversionQueue(job.id)
  // Always include the current stage so an out-of-phase value still renders.
  const STAGE_LABELS = useStageLabels()
  const hiddenStages = new Set(
    (stageSettings ?? []).filter((s) => s.hidden).map((s) => s.stage),
  )
  const stageOptions = (workspaceStages.includes(job.stage)
    ? workspaceStages
    : [job.stage, ...workspaceStages]
  ).filter((s) => !hiddenStages.has(s) || s === job.stage)
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
        {stageOptions.map((s) => (
          <option key={s} value={s}>
            {STAGE_LABELS[s]}
          </option>
        ))}
      </select>
      {updateJob.isError && (
        <span className="text-sm text-red-600">Stage change failed. {updateJob.error.message}</span>
      )}
      <span className="flex items-center gap-2 text-sm text-stone-600">
        {job.contact ? (
          <Link to={`/contacts/${job.contact.id}`} className="text-amber-700 hover:underline">
            {job.contact.full_name}
          </Link>
        ) : (
          '—'
        )}
        {job.contact && !job.contact.confirmed && (
          <>
            <span className="rounded bg-orange-100 px-1.5 py-0.5 text-xs font-medium text-orange-700">
              Unconfirmed
            </span>
            <button
              onClick={() => confirmContact.mutate(job.contact!.id)}
              disabled={confirmContact.isPending}
              className="rounded border border-green-400 bg-white px-2 py-0.5 text-xs font-medium text-green-700 hover:bg-green-50 disabled:opacity-50"
            >
              {confirmContact.isPending ? 'Confirming…' : 'Confirm contact'}
            </button>
          </>
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
      <button
        onClick={() => toggleFollowUp.mutate({ id: job.id, value: !job.follow_up })}
        disabled={toggleFollowUp.isPending}
        title={job.follow_up ? 'Clear follow-up flag' : 'Mark as follow up'}
        className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors disabled:opacity-50 ${
          job.follow_up
            ? 'border-emerald-400 bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
            : 'border-stone-300 bg-white text-stone-500 hover:border-emerald-400 hover:text-emerald-700'
        }`}
      >
        {job.follow_up ? '● Follow up' : '○ Follow up'}
      </button>
      <span className="ml-auto text-lg font-medium tabular-nums text-stone-900">
        {formatCurrency(job.value_final ?? job.value_est)}
      </span>
      {conv && (conv.meta_sent || conv.google_sent) && (
        <span
          title={[
            conv.meta_sent ? 'Meta ✓' : conv.meta_error ? `Meta: ${conv.meta_error}` : null,
            conv.google_sent ? 'Google ✓' : conv.google_error ? `Google: ${conv.google_error}` : null,
          ].filter(Boolean).join(' · ')}
          className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700"
        >
          Ads notified ✓
        </span>
      )}
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
    summary: job.summary ?? '',
    site_address: job.site_address ?? '',
    city: job.city ?? '',
    direction: job.direction ?? '',
    value_est: job.value_est?.toString() ?? '',
    value_final: job.value_final?.toString() ?? '',
    profit_est: job.profit_est?.toString() ?? '',
    profit_final: job.profit_final?.toString() ?? '',
    lead_source: job.lead_source ?? '',
    assigned_to: job.assignee?.id ?? '',
  })
  const [extra, setExtra] = useState<Record<string, string>>(job.extra ?? {})
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
        summary: form.summary.trim() || null,
        site_address: form.site_address.trim() || null,
        city: form.city.trim() || null,
        direction: (form.direction as 'north' | 'south' | 'east' | 'west') || null,
        extra: Object.fromEntries(Object.entries(extra).filter(([, v]) => v.trim() !== '')),
        value_est: form.value_est ? Number(form.value_est) : null,
        value_final: form.value_final ? Number(form.value_final) : null,
        profit_est: form.profit_est ? Number(form.profit_est) : null,
        profit_final: form.profit_final ? Number(form.profit_final) : null,
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
          'Summary (3–4 words, shown on card)',
          <input
            value={form.summary}
            onChange={(e) => setForm({ ...form, summary: e.target.value })}
            placeholder="Kitchen quartz countertops"
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
          'City',
          <input
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
            placeholder="Toronto"
            className={inputClass}
          />,
        )}
        {field(
          'Direction (from Toronto)',
          <select
            value={form.direction}
            onChange={(e) => setForm({ ...form, direction: e.target.value })}
            className={inputClass}
          >
            <option value="">—</option>
            <option value="north">North</option>
            <option value="south">South</option>
            <option value="east">East</option>
            <option value="west">West</option>
          </select>,
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
          'Estimated profit ($)',
          <input
            inputMode="decimal"
            value={form.profit_est}
            onChange={(e) => setForm({ ...form, profit_est: e.target.value })}
            className={inputClass}
          />,
        )}
        {(() => {
          const margin = calcMargin(Number(form.profit_est) || null, Number(form.value_est) || null)
          if (margin == null) return null
          return (
            <div className={`flex items-center gap-1.5 rounded border px-3 py-2 text-sm font-semibold ${
              margin > 50 ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : margin >= 30 ? 'border-amber-200 bg-amber-50 text-amber-700'
              : 'border-red-200 bg-red-50 text-red-700'
            }`}>
              <span>Est. margin</span>
              <span className="tabular-nums">{margin}%</span>
            </div>
          )
        })()}
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
          'Final profit ($)',
          <input
            inputMode="decimal"
            value={form.profit_final}
            onChange={(e) => setForm({ ...form, profit_final: e.target.value })}
            className={inputClass}
          />,
        )}
        {(() => {
          const margin = calcMargin(Number(form.profit_final) || null, Number(form.value_final) || null)
          if (margin == null) return null
          return (
            <div className={`flex items-center gap-1.5 rounded border px-3 py-2 text-sm font-semibold ${
              margin > 50 ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : margin >= 30 ? 'border-amber-200 bg-amber-50 text-amber-700'
              : 'border-red-200 bg-red-50 text-red-700'
            }`}>
              <span>Final margin</span>
              <span className="tabular-nums">{margin}%</span>
            </div>
          )
        })()}
        {field(
          'Lead source',
          <OptionSelect
            listKey="lead_sources"
            value={form.lead_source}
            onChange={(v) => setForm({ ...form, lead_source: v })}
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
      <div className="mt-3">
        <span className="mb-1 block text-sm font-medium text-stone-700">Extra info</span>
        <ExtraFieldsEditor value={extra} onChange={setExtra} />
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
