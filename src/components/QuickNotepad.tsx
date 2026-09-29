import { useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import { supabase } from '../lib/supabase'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useMyMembership } from '../features/settings/api'
import { useCreateTask } from '../features/tasks/api'

interface QuickNote {
  id: string
  body: string
  kind: 'text' | 'voice'
  created_at: string
  completed_at: string | null
}

// ── Data hooks ────────────────────────────────────────────────────────────────

function useQuickNotes() {
  const { data: membership } = useMyMembership()
  const businessId = membership?.activeBusinessId
  return useQuery({
    queryKey: ['quick-notes', businessId],
    enabled: !!businessId,
    queryFn: async (): Promise<QuickNote[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('quick_notes')
        .select('id, body, kind, created_at, completed_at')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return data as QuickNote[]
    },
    staleTime: 30_000,
  })
}

function useAddNote() {
  const { data: membership } = useMyMembership()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ body, kind, voicePath }: { body: string; kind: 'text' | 'voice'; voicePath?: string }) => {
      const businessId = membership?.activeBusinessId
      if (!businessId) throw new Error('No active business')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from('quick_notes').insert({
        business_id: businessId,
        body,
        kind,
        voice_path: voicePath ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['quick-notes'] }),
  })
}

function useUpdateNote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from('quick_notes').update({ body }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['quick-notes'] }),
  })
}

function useToggleComplete() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, complete }: { id: string; complete: boolean }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('quick_notes')
        .update({ completed_at: complete ? new Date().toISOString() : null })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['quick-notes'] }),
  })
}

function useDeleteNote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from('quick_notes').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['quick-notes'] }),
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const isHtmlBody = (s: string) => s.trimStart().startsWith('<')

const stripHtml = (html: string) =>
  html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

const noteToPlainText = (body: string) =>
  isHtmlBody(body) ? stripHtml(body) : body

// ── Toolbar ───────────────────────────────────────────────────────────────────

function ToolBtn({
  onPress,
  active,
  title,
  children,
}: {
  onPress: () => void
  active?: boolean
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onPress() }}
      title={title}
      className={`flex h-7 min-w-[1.75rem] items-center justify-center rounded px-1 text-xs transition-colors ${
        active ? 'bg-amber-100 text-amber-800' : 'text-stone-500 hover:bg-stone-100 hover:text-stone-800'
      }`}
    >
      {children}
    </button>
  )
}

function Toolbar({ editor }: { editor: ReturnType<typeof useEditor> }) {
  if (!editor) return null
  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-stone-100 px-2 py-1.5">
      <ToolBtn onPress={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold (⌘B)">
        <strong>B</strong>
      </ToolBtn>
      <ToolBtn onPress={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic (⌘I)">
        <em>I</em>
      </ToolBtn>
      <ToolBtn onPress={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="Underline">
        <span className="underline">U</span>
      </ToolBtn>
      <ToolBtn onPress={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="Strikethrough">
        <span className="line-through">S</span>
      </ToolBtn>

      <span className="mx-1 h-4 w-px shrink-0 bg-stone-200" />

      <ToolBtn onPress={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Bullet list">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <circle cx="2" cy="3.5" r="1.2" fill="currentColor"/>
          <line x1="5" y1="3.5" x2="13" y2="3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          <circle cx="2" cy="7" r="1.2" fill="currentColor"/>
          <line x1="5" y1="7" x2="13" y2="7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          <circle cx="2" cy="10.5" r="1.2" fill="currentColor"/>
          <line x1="5" y1="10.5" x2="11" y2="10.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
      </ToolBtn>
      <ToolBtn onPress={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Numbered list">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <text x="0.5" y="5.5" fontSize="5.5" fill="currentColor" fontFamily="system-ui, sans-serif">1.</text>
          <line x1="5.5" y1="4" x2="13" y2="4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          <text x="0.5" y="10" fontSize="5.5" fill="currentColor" fontFamily="system-ui, sans-serif">2.</text>
          <line x1="5.5" y1="8.5" x2="13" y2="8.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
      </ToolBtn>

      <span className="mx-1 h-4 w-px shrink-0 bg-stone-200" />

      <ToolBtn onPress={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })} title="Heading 1">
        <span className="text-[11px] font-bold">H1</span>
      </ToolBtn>
      <ToolBtn onPress={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="Heading 2">
        <span className="text-[11px] font-semibold">H2</span>
      </ToolBtn>

      <span className="mx-1 h-4 w-px shrink-0 bg-stone-200" />

      <ToolBtn onPress={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive('codeBlock')} title="Code block">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="4,3 1,7 4,11"/>
          <polyline points="10,3 13,7 10,11"/>
        </svg>
      </ToolBtn>
    </div>
  )
}

// ── Inline editor (edit mode for an existing note) ────────────────────────────

function NoteInlineEditor({
  initialContent,
  onSave,
  onCancel,
}: {
  initialContent: string
  onSave: (html: string) => void
  onCancel: () => void
}) {
  const editor = useEditor({
    extensions: [StarterKit, Underline],
    content: initialContent,
    editorProps: { attributes: { class: 'note-editor' } },
    autofocus: 'end',
  })

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onCancel() }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        if (editor && !editor.isEmpty) onSave(editor.getHTML())
      }
    }
    document.addEventListener('keydown', handler, true)
    return () => document.removeEventListener('keydown', handler, true)
  }, [editor, onSave, onCancel])

  return (
    <div className="rounded-lg border border-amber-400 bg-white shadow-sm">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
      <div className="flex justify-end gap-2 border-t border-stone-100 px-2.5 py-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded px-3 py-1 text-xs text-stone-500 hover:bg-stone-100"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => { if (editor && !editor.isEmpty) onSave(editor.getHTML()) }}
          className="rounded bg-stone-900 px-3 py-1 text-xs font-medium text-white hover:bg-stone-800"
        >
          Save
        </button>
      </div>
    </div>
  )
}

// ── Note card ─────────────────────────────────────────────────────────────────

function NoteBody({ body, kind }: { body: string; kind: string }) {
  if (kind === 'voice' || !isHtmlBody(body)) {
    return <p className="break-words text-sm text-stone-800 whitespace-pre-wrap">{body}</p>
  }
  return (
    <div
      className="note-body break-words text-sm text-stone-800"
      dangerouslySetInnerHTML={{ __html: body }}
    />
  )
}

function NoteCard({
  note,
  onDelete,
  onUpdate,
  onComplete,
  onConvertToTask,
}: {
  note: QuickNote
  onDelete: () => void
  onUpdate: (html: string) => void
  onComplete: () => void
  onConvertToTask: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [taskFlash, setTaskFlash] = useState(false)
  const done = !!note.completed_at

  const handleConvertToTask = () => {
    onConvertToTask()
    setTaskFlash(true)
    setTimeout(() => setTaskFlash(false), 2000)
  }

  if (editing) {
    return (
      <NoteInlineEditor
        initialContent={note.body}
        onSave={(html) => { onUpdate(html); setEditing(false) }}
        onCancel={() => setEditing(false)}
      />
    )
  }

  if (done) {
    return (
      <div className="group flex items-start gap-2 rounded-lg border border-stone-100 bg-stone-50/60 px-3 py-2 opacity-60">
        <div className="min-w-0 flex-1 line-through">
          <NoteBody body={note.body} kind={note.kind} />
        </div>
        <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <ActionIconBtn onClick={onComplete} title="Restore">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M1 6a5 5 0 105-5H4M4 1v3h3"/>
            </svg>
          </ActionIconBtn>
          <ActionIconBtn onClick={onDelete} title="Delete" danger>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M2 3h8M5 3V2h2v1M4 3v6M6 3v6M8 3v6"/>
            </svg>
          </ActionIconBtn>
        </div>
      </div>
    )
  }

  return (
    <div className="group rounded-lg border border-stone-100 bg-stone-50 px-3 py-2.5">
      {note.kind === 'voice' && (
        <span className="mr-1 text-xs text-amber-600">🎙</span>
      )}
      <NoteBody body={note.body} kind={note.kind} />

      {/* Action row — visible on hover */}
      <div className="mt-1.5 flex items-center justify-between opacity-0 transition-opacity group-hover:opacity-100">
        {taskFlash ? (
          <span className="text-xs text-emerald-600">Added to Tasks ✓</span>
        ) : (
          <div className="flex gap-1">
            <ActionIconBtn onClick={() => setEditing(true)} title="Edit">
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7.5 1.5l2 2L3 10H1V8z"/>
              </svg>
            </ActionIconBtn>
            <ActionIconBtn onClick={handleConvertToTask} title="Convert to task">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="1" width="10" height="10" rx="2"/>
                <path d="M3.5 6l2 2 3-3"/>
              </svg>
            </ActionIconBtn>
          </div>
        )}
        <div className="flex gap-1">
          <ActionIconBtn onClick={onComplete} title="Mark done" className="text-emerald-600 hover:bg-emerald-50">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1.5 6l3 3 6-6"/>
            </svg>
          </ActionIconBtn>
          <ActionIconBtn onClick={onDelete} title="Delete" danger>
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M2 2l7 7M9 2L2 9"/>
            </svg>
          </ActionIconBtn>
        </div>
      </div>
    </div>
  )
}

function ActionIconBtn({
  onClick,
  title,
  danger,
  className,
  children,
}: {
  onClick: () => void
  title: string
  danger?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`flex h-6 w-6 items-center justify-center rounded transition-colors ${
        danger
          ? 'text-stone-400 hover:bg-red-50 hover:text-red-500'
          : className ?? 'text-stone-400 hover:bg-stone-200 hover:text-stone-700'
      }`}
    >
      {children}
    </button>
  )
}

// ── Voice recording ───────────────────────────────────────────────────────────

type RecState = 'idle' | 'recording' | 'uploading'

// ── Main component ────────────────────────────────────────────────────────────

export function QuickNotepad() {
  const [open, setOpen] = useState(false)
  const [doneOpen, setDoneOpen] = useState(false)
  const [recState, setRecState] = useState<RecState>('idle')
  const [recError, setRecError] = useState<string | null>(null)
  const mediaRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const { data: notes, isPending } = useQuickNotes()
  const addNote = useAddNote()
  const updateNote = useUpdateNote()
  const deleteNote = useDeleteNote()
  const toggleComplete = useToggleComplete()
  const createTask = useCreateTask()

  const active = notes?.filter((n) => !n.completed_at) ?? []
  const done = notes?.filter((n) => !!n.completed_at) ?? []

  // Compose editor — lives at component level to persist across open/close
  const editor = useEditor({
    extensions: [StarterKit, Underline],
    editorProps: { attributes: { class: 'note-editor' } },
  })

  useEffect(() => {
    if (open) setTimeout(() => editor?.commands.focus(), 60)
  }, [open, editor])

  const submit = () => {
    if (!editor || editor.isEmpty) return
    addNote.mutate({ body: editor.getHTML(), kind: 'text' })
    editor.commands.clearContent()
  }

  const handleConvertToTask = (note: QuickNote) => {
    const title = noteToPlainText(note.body).slice(0, 120)
    if (!title) return
    createTask.mutate({ title, job_id: null, assigned_to: null, due_date: null })
    toggleComplete.mutate({ id: note.id, complete: true })
  }

  // Voice recording
  const startRecording = async () => {
    setRecError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const rec = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      chunksRef.current = []
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        await uploadAndTranscribe(blob)
      }
      rec.start()
      mediaRef.current = rec
      setRecState('recording')
    } catch {
      setRecError('Microphone access denied')
    }
  }

  const stopRecording = () => {
    mediaRef.current?.stop()
    mediaRef.current = null
    setRecState('uploading')
  }

  const uploadAndTranscribe = async (blob: Blob) => {
    try {
      const filename = `voice-notes/quick-${Date.now()}.webm`
      const { error: upErr } = await supabase.storage.from('job-files').upload(filename, blob, {
        contentType: 'audio/webm',
        upsert: false,
      })
      if (upErr) throw upErr
      const { data: txData } = await supabase.functions.invoke('transcribe', { body: { path: filename } })
      const transcript: string = txData?.text ?? '[voice note — transcription unavailable]'
      addNote.mutate({ body: transcript, kind: 'voice', voicePath: filename })
    } catch (e) {
      setRecError((e as Error).message)
    } finally {
      setRecState('idle')
    }
  }

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])

  const noteCount = active.length

  return (
    <>
      {/* Floating trigger */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Quick notepad"
        className={`fixed bottom-5 left-5 z-30 flex h-11 w-11 items-center justify-center rounded-full shadow-lg ring-2 transition-transform hover:scale-110 ${
          noteCount > 0
            ? 'bg-amber-600 ring-amber-400/70 text-white'
            : 'bg-white ring-stone-300/70 text-stone-600'
        }`}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M4 3h12a1 1 0 011 1v10a1 1 0 01-1 1H8l-4 3V4a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
          <path d="M7 8h6M7 11h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
        {noteCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-800 text-[9px] font-bold text-white">
            {noteCount > 9 ? '9+' : noteCount}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed bottom-20 left-5 z-30 flex h-[min(38rem,calc(100dvh-7rem))] w-80 max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl">
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-stone-100 px-4 py-3">
            <div>
              <span className="text-sm font-semibold text-stone-800">Quick notes</span>
              <span className="ml-2 text-xs text-stone-400">Sara reads these first</span>
            </div>
            <button onClick={() => setOpen(false)} className="text-stone-400 hover:text-stone-700" aria-label="Close">✕</button>
          </div>

          {/* Notes list */}
          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            {isPending && <p className="py-4 text-center text-sm text-stone-400">Loading…</p>}
            {!isPending && active.length === 0 && done.length === 0 && (
              <p className="py-6 text-center text-sm text-stone-400">
                Nothing yet — jot a note below or tap the mic.
              </p>
            )}

            {active.map((n) => (
              <NoteCard
                key={n.id}
                note={n}
                onDelete={() => deleteNote.mutate(n.id)}
                onUpdate={(html) => updateNote.mutate({ id: n.id, body: html })}
                onComplete={() => toggleComplete.mutate({ id: n.id, complete: true })}
                onConvertToTask={() => handleConvertToTask(n)}
              />
            ))}

            {/* Done section */}
            {done.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => setDoneOpen((v) => !v)}
                  className="flex w-full items-center gap-1.5 py-1 text-xs font-medium text-stone-400 hover:text-stone-600"
                >
                  <svg
                    width="10" height="10" viewBox="0 0 10 10" fill="none"
                    className={`shrink-0 transition-transform ${doneOpen ? 'rotate-90' : ''}`}
                  >
                    <path d="M3 2l4 3-4 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Done ({done.length})
                </button>
                {doneOpen && (
                  <div className="mt-1 space-y-1.5">
                    {done.map((n) => (
                      <NoteCard
                        key={n.id}
                        note={n}
                        onDelete={() => deleteNote.mutate(n.id)}
                        onUpdate={(html) => updateNote.mutate({ id: n.id, body: html })}
                        onComplete={() => toggleComplete.mutate({ id: n.id, complete: false })}
                        onConvertToTask={() => handleConvertToTask(n)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Compose area */}
          <div className="shrink-0 border-t border-stone-100">
            <Toolbar editor={editor} />

            <div className="relative">
              <EditorContent editor={editor} />
              {editor?.isEmpty && recState === 'idle' && (
                <p className="pointer-events-none absolute left-2.5 top-2 select-none text-sm text-stone-400">
                  Write a note…
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 px-3 pb-3 pt-2">
              {recError && <p className="flex-1 truncate text-xs text-red-500">{recError}</p>}
              {!recError && <div className="flex-1" />}

              {/* Voice button */}
              <button
                type="button"
                onClick={recState === 'idle' ? startRecording : recState === 'recording' ? stopRecording : undefined}
                disabled={recState === 'uploading'}
                aria-label={recState === 'recording' ? 'Stop recording' : 'Record voice note'}
                title={recState === 'recording' ? 'Stop recording' : 'Record voice note'}
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                  recState === 'recording'
                    ? 'animate-pulse border-red-400 bg-red-50 text-red-500'
                    : recState === 'uploading'
                    ? 'border-stone-200 bg-stone-50 text-stone-300'
                    : 'border-stone-300 bg-white text-stone-500 hover:border-amber-500 hover:text-amber-600'
                }`}
              >
                {recState === 'uploading' ? (
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z"/>
                  </svg>
                ) : recState === 'recording' ? (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><rect x="2" y="2" width="8" height="8" rx="1.5"/></svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="4" y="1" width="6" height="8" rx="3"/>
                    <path d="M1.5 7c0 3.04 2.1 5 5.5 5s5.5-1.96 5.5-5" strokeLinecap="round"/>
                    <line x1="7" y1="12" x2="7" y2="13.5" strokeLinecap="round"/>
                  </svg>
                )}
              </button>

              <button
                type="button"
                onClick={submit}
                disabled={!editor || editor.isEmpty || addNote.isPending}
                className="rounded-lg bg-stone-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-40"
              >
                {addNote.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
