import { useRef, useState } from 'react'
import { AudioNote } from '../../../components/AudioNote'
import { NoteComposer } from '../../../components/NoteComposer'
import { useAuth } from '../../auth/AuthProvider'
import { formatDateTime } from '../../../lib/format'
import { useActivities, useAddNote, useDeleteNote, useUpdateNote } from '../api'
import { STAGE_LABELS } from './StageBadge'
import type { JobStage } from '../api'

const isHtmlBody = (s: string) => s.trimStart().startsWith('<')

function stripHtml(html: string) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function NoteBody({ kind, body, meta }: { kind: string; body: string | null; meta: Record<string, unknown> | null }) {
  if (kind === 'stage_change' && meta) {
    const from = meta.from as JobStage | undefined
    const to = meta.to as JobStage | undefined
    if (from && to)
      return <p className="text-stone-800">{`Stage changed: ${STAGE_LABELS[from] ?? from} → ${STAGE_LABELS[to] ?? to}`}</p>
  }
  const text = body ?? kind
  if (kind === 'note' && isHtmlBody(text)) {
    return <div className="note-body text-sm text-stone-800" dangerouslySetInnerHTML={{ __html: text }} />
  }
  return <p className="text-stone-800">{text}</p>
}

const KIND_ICONS: Record<string, string> = {
  note: '📝',
  call: '📞',
  sms: '💬',
  email: '✉️',
  meeting: '🤝',
  stage_change: '🔀',
  system: '⚙️',
}

export function ActivityTimeline({ jobId, contactId, title = 'Activity' }: { jobId: string; contactId?: string | null; title?: string }) {
  const { session } = useAuth()
  const { data: activities, isPending, isError, error } = useActivities(jobId)
  const addNote = useAddNote(jobId, contactId)
  const deleteNote = useDeleteNote(jobId)
  const updateNote = useUpdateNote(jobId)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editBody, setEditBody] = useState('')
  const editRef = useRef<HTMLTextAreaElement>(null)

  const startEdit = (id: string, body: string | null) => {
    const plain = body ? (isHtmlBody(body) ? stripHtml(body) : body) : ''
    setEditingId(id)
    setEditBody(plain)
    // Focus after render
    setTimeout(() => editRef.current?.focus(), 0)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditBody('')
  }

  const saveEdit = (id: string) => {
    const trimmed = editBody.trim()
    if (!trimmed) return
    updateNote.mutate({ id, body: trimmed }, {
      onSuccess: () => { setEditingId(null); setEditBody('') },
    })
  }

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
      {deleteNote.isError && (
        <p className="mb-2 text-sm text-red-600">Could not delete. {deleteNote.error.message}</p>
      )}
      {updateNote.isError && (
        <p className="mb-2 text-sm text-red-600">Could not save. {updateNote.error.message}</p>
      )}
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
              {editingId === a.id ? (
                <div className="space-y-1.5">
                  <textarea
                    ref={editRef}
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') cancelEdit()
                      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) saveEdit(a.id)
                    }}
                    rows={3}
                    className="w-full rounded border border-amber-400 px-2 py-1.5 text-sm focus:border-amber-600 focus:outline-none"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => saveEdit(a.id)}
                      disabled={updateNote.isPending || !editBody.trim()}
                      className="rounded bg-stone-900 px-3 py-1 text-xs font-medium text-white hover:bg-stone-700 disabled:opacity-50"
                    >
                      {updateNote.isPending ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="rounded border border-stone-300 px-3 py-1 text-xs text-stone-600 hover:bg-stone-50"
                    >
                      Cancel
                    </button>
                    <span className="text-xs text-stone-400">Ctrl+Enter to save</span>
                  </div>
                </div>
              ) : (
                <>
                  <NoteBody kind={a.kind} body={a.body} meta={a.meta} />
                  {typeof a.meta?.audio_path === 'string' && <AudioNote path={a.meta.audio_path} />}
                </>
              )}
              <p className="text-xs text-stone-400">
                {formatDateTime(a.created_at)}
                {a.user?.full_name ? ` — ${a.user.full_name}` : ''}
              </p>
            </div>
            {a.kind === 'note' && editingId !== a.id && (
              <div className="flex shrink-0 flex-col items-center gap-1 self-start">
                <button
                  onClick={() => startEdit(a.id, a.body)}
                  className="text-stone-300 hover:text-amber-600"
                  aria-label="Edit note"
                  title="Edit note"
                >
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9.5 2.5l1 1-7 7H2.5v-1l7-7z"/>
                    <path d="M8.5 3.5l1 1"/>
                  </svg>
                </button>
                <button
                  onClick={() => {
                    if (window.confirm('Delete this note?')) deleteNote.mutate(a.id)
                  }}
                  className="text-stone-300 hover:text-red-600"
                  aria-label="Delete note"
                  title="Delete note (yours, or any as admin)"
                >
                  ×
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
