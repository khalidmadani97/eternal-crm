import { AudioNote } from '../../../components/AudioNote'
import { NoteComposer } from '../../../components/NoteComposer'
import { useAuth } from '../../auth/AuthProvider'
import { formatDateTime } from '../../../lib/format'
import { useActivities, useAddNote } from '../api'
import { STAGE_LABELS } from './StageBadge'
import type { JobStage } from '../api'

const KIND_ICONS: Record<string, string> = {
  note: '📝',
  call: '📞',
  sms: '💬',
  email: '✉️',
  meeting: '🤝',
  stage_change: '🔀',
  system: '⚙️',
}

export function ActivityTimeline({ jobId, title = 'Activity' }: { jobId: string; title?: string }) {
  const { session } = useAuth()
  const { data: activities, isPending, isError, error } = useActivities(jobId)
  const addNote = useAddNote(jobId)

  return (
    <section className="rounded-lg border border-stone-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">
        {title}
      </h2>
      <div className="mb-4">
        <NoteComposer
          pending={addNote.isPending}
          errorMessage={addNote.isError ? `Could not add the note. ${addNote.error.message}` : null}
          onSubmit={async ({ body, audioPath }) => {
            if (!session) return
            await addNote.mutateAsync({ body, userId: session.user.id, audioPath })
          }}
        />
      </div>
      {isPending && <p className="py-4 text-sm text-stone-500">Loading activity…</p>}
      {isError && (
        <p className="py-4 text-sm text-red-600">Could not load activity. {error.message}</p>
      )}
      {activities && activities.length === 0 && (
        <p className="py-4 text-sm text-stone-500">Nothing on the timeline yet.</p>
      )}
      <ul className="space-y-3">
        {activities?.map((a) => (
          <li key={a.id} className="flex gap-3 text-sm">
            <span aria-hidden>{KIND_ICONS[a.kind] ?? '•'}</span>
            <div className="min-w-0 flex-1">
              <p className="text-stone-800">{describeActivity(a.kind, a.body, a.meta)}</p>
              {typeof a.meta?.audio_path === 'string' && <AudioNote path={a.meta.audio_path} />}
              <p className="text-xs text-stone-400">
                {formatDateTime(a.created_at)}
                {a.user?.full_name ? ` — ${a.user.full_name}` : ''}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

function describeActivity(
  kind: string,
  body: string | null,
  meta: Record<string, unknown> | null,
): string {
  if (kind === 'stage_change' && meta) {
    const from = meta.from as JobStage | undefined
    const to = meta.to as JobStage | undefined
    if (from && to)
      return `Stage changed: ${STAGE_LABELS[from] ?? from} → ${STAGE_LABELS[to] ?? to}`
  }
  return body ?? kind
}
