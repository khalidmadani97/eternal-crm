import { useState } from 'react'
import { formatDateTime } from '../../../lib/format'
import { APPT_KIND_LABELS, APPT_KIND_STYLES, useJobAppointments } from '../api'
import { AppointmentDialog } from './AppointmentDialog'

export function JobAppointments({ jobId }: { jobId: string }) {
  const { data: appointments, isPending, isError, error } = useJobAppointments(jobId)
  const [showNew, setShowNew] = useState(false)
  const upcoming = appointments?.filter(
    (a) => new Date(a.starts_at).getTime() > Date.now() - 24 * 3600_000,
  )

  return (
    <section className="rounded-lg border border-stone-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">
          Appointments
        </h2>
        <button
          onClick={() => setShowNew(true)}
          className="rounded border border-stone-300 px-2 py-1 text-xs text-stone-700 hover:bg-stone-50"
        >
          + New
        </button>
      </div>
      {isPending && <p className="py-2 text-sm text-stone-500">Loading appointments…</p>}
      {isError && (
        <p className="py-2 text-sm text-red-600">Could not load appointments. {error.message}</p>
      )}
      {upcoming && upcoming.length === 0 && (
        <p className="py-2 text-sm text-stone-500">Nothing scheduled.</p>
      )}
      <ul className="space-y-2">
        {upcoming?.map((a) => (
          <li key={a.id} className={`rounded border px-2 py-1.5 text-sm ${APPT_KIND_STYLES[a.kind]}`}>
            <p className="font-medium">{APPT_KIND_LABELS[a.kind]}</p>
            <p className="text-xs">
              {formatDateTime(a.starts_at)}
              {a.assignee?.full_name ? ` — ${a.assignee.full_name}` : ''}
            </p>
          </li>
        ))}
      </ul>
      {showNew && <AppointmentDialog jobId={jobId} onClose={() => setShowNew(false)} />}
    </section>
  )
}
