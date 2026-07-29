import { useRef, useState } from 'react'
import { useAuth } from '../../auth/AuthProvider'
import { useUploadFile } from '../../jobs/api'
import { useMoveJobStage } from '../../jobs/api'
import type { JobStage } from '../../jobs/api'
import { formatPhone } from '../../../lib/format'
import { enqueueUpload } from '../../../lib/uploadQueue'
import { APPT_KIND_LABELS, APPT_KIND_STYLES, useAppointments } from '../api'
import type { AppointmentRow } from '../api'

/** Which stage a field visit completes into, by appointment kind. Kinds with
 *  no field-completable stage (consultation, service, pickup) get no button. */
const COMPLETE_TO: Partial<Record<string, JobStage>> = {
  template: 'templated',
  install: 'installed',
}

export function FieldPage() {
  const now = new Date()
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dayEnd = new Date(dayStart)
  dayEnd.setDate(dayEnd.getDate() + 1)
  const { data: appointments, isPending, isError, error, refetch } = useAppointments(
    dayStart.toISOString(),
    dayEnd.toISOString(),
  )

  return (
    <div className="min-h-screen bg-stone-100 p-4">
      <header className="mb-4">
        <h1 className="text-lg font-semibold text-stone-900">
          Today —{' '}
          {now.toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' })}
        </h1>
      </header>
      {isPending && <p className="py-8 text-center text-stone-500">Loading today’s schedule…</p>}
      {isError && (
        <div className="py-8 text-center">
          <p className="mb-2 text-red-600">Could not load the schedule. {error.message}</p>
          <button
            onClick={() => void refetch()}
            className="min-h-12 rounded border border-stone-300 px-4 text-sm"
          >
            Retry
          </button>
        </div>
      )}
      {appointments && appointments.length === 0 && (
        <p className="py-8 text-center text-stone-500">Nothing scheduled today.</p>
      )}
      <div className="space-y-3">
        {appointments?.map((a) => <FieldCard key={a.id} appt={a} />)}
      </div>
    </div>
  )
}

function FieldCard({ appt }: { appt: AppointmentRow }) {
  const { session } = useAuth()
  const job = appt.job
  const upload = useUploadFile(job?.id ?? '')
  const moveStage = useMoveJobStage()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploaded, setUploaded] = useState(0)
  const [queued, setQueued] = useState(0)

  const completeTo = COMPLETE_TO[appt.kind]
  const alreadyComplete = job && completeTo ? job.stage === completeTo : false

  // No signal on site: photos queue in IndexedDB and flush on the next
  // foreground with connectivity (Slice 14 — no Background Sync API).
  const onPhotos = async (files: FileList | null) => {
    if (!files || !session || !job) return
    for (const file of Array.from(files)) {
      if (!navigator.onLine) {
        await enqueueUpload({ jobId: job.id, kind: 'site_photo', file, userId: session.user.id })
        setQueued((n) => n + 1)
        continue
      }
      try {
        await upload.mutateAsync({ file, kind: 'site_photo', userId: session.user.id })
        setUploaded((n) => n + 1)
      } catch {
        await enqueueUpload({ jobId: job.id, kind: 'site_photo', file, userId: session.user.id })
        setQueued((n) => n + 1)
      }
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className={`rounded border px-2 py-1 text-sm font-medium ${APPT_KIND_STYLES[appt.kind]}`}>
          {new Date(appt.starts_at).toLocaleTimeString('en-CA', {
            hour: 'numeric',
            minute: '2-digit',
          })}{' '}
          · {APPT_KIND_LABELS[appt.kind]}
        </span>
        {appt.assignee?.full_name && (
          <span className="text-sm text-stone-500">{appt.assignee.full_name}</span>
        )}
      </div>
      {job && (
        <>
          <p className="mt-2 font-medium text-stone-900">
            {job.job_number} — {job.title}
          </p>
          {job.contact && <p className="text-sm text-stone-600">{job.contact.full_name}</p>}
          {appt.notes && <p className="mt-1 text-sm text-stone-500">{appt.notes}</p>}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <a
              href={
                job.site_address
                  ? `https://maps.google.com/?q=${encodeURIComponent(job.site_address)}`
                  : undefined
              }
              target="_blank"
              rel="noreferrer"
              aria-disabled={!job.site_address}
              className={`flex min-h-12 items-center justify-center rounded-lg text-sm font-medium ${
                job.site_address
                  ? 'bg-stone-900 text-white active:bg-stone-700'
                  : 'pointer-events-none bg-stone-200 text-stone-400'
              }`}
            >
              Navigate
            </a>
            <a
              href={job.contact?.phone ? `tel:${job.contact.phone}` : undefined}
              aria-disabled={!job.contact?.phone}
              className={`flex min-h-12 items-center justify-center rounded-lg text-sm font-medium ${
                job.contact?.phone
                  ? 'bg-stone-900 text-white active:bg-stone-700'
                  : 'pointer-events-none bg-stone-200 text-stone-400'
              }`}
            >
              Call {job.contact?.phone ? formatPhone(job.contact.phone) : ''}
            </a>
            <label className="flex min-h-12 cursor-pointer items-center justify-center rounded-lg border border-stone-300 bg-white text-sm font-medium text-stone-800 active:bg-stone-100">
              {upload.isPending
                ? 'Uploading…'
                : queued > 0
                  ? `Photos (${queued} queued offline)`
                  : uploaded > 0
                    ? `Photos (${uploaded} up)`
                    : 'Upload photos'}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                className="hidden"
                onChange={(e) => void onPhotos(e.target.files)}
              />
            </label>
            {completeTo && (
              <button
                onClick={() => moveStage.mutate({ id: job.id, stage: completeTo })}
                disabled={moveStage.isPending || alreadyComplete}
                className={`min-h-12 rounded-lg text-sm font-medium ${
                  alreadyComplete
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-600 text-white active:bg-amber-700'
                } disabled:opacity-80`}
              >
                {alreadyComplete ? 'Done ✓' : `Mark ${APPT_KIND_LABELS[appt.kind].toLowerCase()} complete`}
              </button>
            )}
          </div>
          {upload.isError && (
            <p className="mt-2 text-sm text-red-600">Upload failed. {upload.error.message}</p>
          )}
          {moveStage.isError && (
            <p className="mt-2 text-sm text-red-600">Update failed. {moveStage.error.message}</p>
          )}
        </>
      )}
    </div>
  )
}
