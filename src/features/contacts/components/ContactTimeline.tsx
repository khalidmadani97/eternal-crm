import { Link } from 'react-router-dom'
import { AudioNote } from '../../../components/AudioNote'
import { NoteComposer } from '../../../components/NoteComposer'
import { useAuth } from '../../auth/AuthProvider'
import { formatDateTime } from '../../../lib/format'
import { useAddContactNote, useContactActivities } from '../api'

const KIND_ICONS: Record<string, string> = {
  note: '📝',
  call: '📞',
  sms: '💬',
  dm: '💠',
  email: '✉️',
  meeting: '🤝',
  stage_change: '🔀',
  system: '⚙️',
}

/** Notes + comms history on the contact card, with voice dictation. */
export function ContactTimeline({ contactId }: { contactId: string }) {
  const { session } = useAuth()
  const { data: activities, isPending, isError, error } = useContactActivities(contactId)
  const addNote = useAddContactNote(contactId)

  return (
    <section className="rounded-lg border border-stone-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">
        Notes &amp; activity
      </h2>
      <div className="mb-4">
        <NoteComposer
          placeholder="Add a note about this contact…"
          pending={addNote.isPending}
          errorMessage={addNote.isError ? `Could not add the note. ${addNote.error.message}` : null}
          onSubmit={async ({ body, audioPath }) => {
            if (!session) return
            await addNote.mutateAsync({ body, userId: session.user.id, audioPath })
          }}
        />
      </div>
      {isPending && <p className="py-2 text-sm text-stone-500">Loading activity…</p>}
      {isError && (
        <p className="py-2 text-sm text-red-600">Could not load activity. {error.message}</p>
      )}
      {activities && activities.length === 0 && (
        <p className="py-2 text-sm text-stone-500">Nothing recorded yet.</p>
      )}
      <ul className="space-y-3">
        {activities?.map((a) => (
          <li key={a.id} className="flex gap-3 text-sm">
            <span aria-hidden>{KIND_ICONS[a.kind] ?? '•'}</span>
            <div className="min-w-0 flex-1">
              <p className="text-stone-800">{a.body ?? a.kind}</p>
              {typeof a.meta?.audio_path === 'string' && <AudioNote path={a.meta.audio_path} />}
              <p className="text-xs text-stone-400">
                {formatDateTime(a.created_at)}
                {a.user?.full_name ? ` — ${a.user.full_name}` : ''}
                {a.job && (
                  <>
                    {' · '}
                    <Link to={`/jobs/${a.job.id}`} className="text-amber-700 hover:underline">
                      {a.job.job_number}
                    </Link>
                  </>
                )}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
