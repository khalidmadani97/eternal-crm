import { useState } from 'react'
import { useProfiles } from '../../auth/api'
import { useJobs } from '../../jobs/api'
import { APPT_KIND_LABELS, APPT_KINDS, useCreateAppointment } from '../api'
import type { ApptKind } from '../api'

interface Props {
  /** Fixed job (job detail page) or undefined to pick one (calendar). */
  jobId?: string
  /** Prefill date (YYYY-MM-DD) when created by clicking a calendar day. */
  initialDate?: string
  onClose: () => void
}

export function AppointmentDialog({ jobId, initialDate, onClose }: Props) {
  const createAppointment = useCreateAppointment()
  const { data: jobs } = useJobs()
  const { data: profiles } = useProfiles()
  const [form, setForm] = useState({
    job_id: jobId ?? '',
    kind: 'consultation' as ApptKind,
    date: initialDate ?? new Date().toISOString().slice(0, 10),
    time: '09:00',
    durationHours: '2',
    assigned_to: '',
    notes: '',
  })
  const [validationError, setValidationError] = useState<string | null>(null)

  const submit = () => {
    if (!form.job_id) {
      setValidationError('Pick a job')
      return
    }
    const starts = new Date(`${form.date}T${form.time}:00`)
    if (Number.isNaN(starts.getTime())) {
      setValidationError('Enter a valid date and time')
      return
    }
    const hours = Number(form.durationHours)
    const ends =
      form.durationHours && !Number.isNaN(hours) && hours > 0
        ? new Date(starts.getTime() + hours * 3600_000)
        : null
    setValidationError(null)
    createAppointment.mutate(
      {
        job_id: form.job_id,
        kind: form.kind,
        starts_at: starts.toISOString(),
        ends_at: ends ? ends.toISOString() : null,
        assigned_to: form.assigned_to || null,
        notes: form.notes.trim() || null,
      },
      { onSuccess: onClose },
    )
  }

  const inputClass =
    'w-full rounded border border-stone-300 px-3 py-2 text-sm focus:border-amber-600 focus:outline-none'

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-stone-900">New appointment</h2>
        <div className="space-y-3">
          {!jobId && (
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-stone-700">Job</span>
              <select
                value={form.job_id}
                onChange={(e) => setForm({ ...form, job_id: e.target.value })}
                className={inputClass}
              >
                <option value="">Pick a job…</option>
                {jobs?.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.job_number} — {j.title}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-stone-700">Kind</span>
              <select
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value as ApptKind })}
                className={inputClass}
              >
                {APPT_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {APPT_KIND_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-stone-700">Assigned to</span>
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
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-stone-700">Date</span>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className={inputClass}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-stone-700">Time</span>
              <input
                type="time"
                value={form.time}
                onChange={(e) => setForm({ ...form, time: e.target.value })}
                className={inputClass}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-stone-700">Duration (hours)</span>
              <input
                inputMode="decimal"
                value={form.durationHours}
                onChange={(e) => setForm({ ...form, durationHours: e.target.value })}
                className={inputClass}
              />
            </label>
          </div>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-stone-700">Notes</span>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              className={inputClass}
            />
          </label>
          {(validationError || createAppointment.isError) && (
            <p className="text-sm text-red-600">
              {validationError ?? createAppointment.error?.message}
            </p>
          )}
          <div className="flex justify-end gap-3 pt-1">
            <button
              onClick={onClose}
              className="rounded border border-stone-300 px-4 py-2 text-sm text-stone-700 hover:bg-stone-50"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={createAppointment.isPending}
              className="rounded bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
            >
              {createAppointment.isPending ? 'Creating…' : 'Create'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
