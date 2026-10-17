import { useCallback, useEffect, useRef, useState } from 'react'
import { useEditor, useEditorState, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import { supabase } from '../lib/supabase'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useMyMembership } from '../features/settings/api'
import { RichToolbar } from './RichToolbar'

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

// ── Toolbar ── imported from RichToolbar ──────────────────────────────────────

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
      <RichToolbar editor={editor} />
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
  onUndoConvert,
}: {
  note: QuickNote
  onDelete: () => void
  onUpdate: (html: string) => void
  onComplete: () => void
  onConvertToTask: () => Promise<string | null>
  onUndoConvert: (taskId: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [taskFlash, setTaskFlash] = useState<{ taskId: string } | null>(null)
  const done = !!note.completed_at

  const handleConvertToTask = async () => {
    const taskId = await onConvertToTask()
    if (!taskId) return
    setTaskFlash({ taskId })
    setTimeout(() => setTaskFlash(null), 5000)
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
          <span className="flex items-center gap-2 text-xs text-emerald-600">
            Added to Tasks ✓
            <button
              type="button"
              onClick={() => { onUndoConvert(taskFlash.taskId); setTaskFlash(null) }}
              className="rounded px-1 py-0.5 text-xs text-stone-500 underline hover:text-stone-800"
            >
              Undo
            </button>
          </span>
        ) : (
          <div className="flex gap-1">
            <ActionIconBtn onClick={() => setEditing(true)} title="Edit" label="Edit">
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7.5 1.5l2 2L3 10H1V8z"/>
              </svg>
            </ActionIconBtn>
            <ActionIconBtn onClick={() => void handleConvertToTask()} title="Convert to task" label="Task">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="1" width="10" height="10" rx="2"/>
                <path d="M3.5 6l2 2 3-3"/>
              </svg>
            </ActionIconBtn>
          </div>
        )}
        <div className="flex gap-1">
          <ActionIconBtn onClick={onComplete} title="Mark done" label="Done" className="text-emerald-600 hover:bg-emerald-50">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1.5 6l3 3 6-6"/>
            </svg>
          </ActionIconBtn>
          <ActionIconBtn onClick={onDelete} title="Delete" label="Delete" danger>
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
  label,
  children,
}: {
  onClick: () => void
  title: string
  danger?: boolean
  className?: string
  label?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`flex items-center gap-1 rounded transition-colors ${
        label ? 'px-1.5 py-1 text-xs' : 'h-6 w-6 justify-center'
      } ${
        danger
          ? 'text-stone-400 hover:bg-red-50 hover:text-red-500'
          : className ?? 'text-stone-400 hover:bg-stone-200 hover:text-stone-700'
      }`}
    >
      {children}
      {label && <span>{label}</span>}
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

  const queryClient = useQueryClient()
  const { data: membership } = useMyMembership()
  const businessId = membership?.activeBusinessId
  const { data: notes, isPending } = useQuickNotes()
  const addNote = useAddNote()
  const updateNote = useUpdateNote()
  const deleteNote = useDeleteNote()
  const toggleComplete = useToggleComplete()

  const active = notes?.filter((n) => !n.completed_at) ?? []
  const done = notes?.filter((n) => !!n.completed_at) ?? []

  // ── Undo toast ──────────────────────────────────────────────────────────────
  const [undoToast, setUndoToast] = useState<{ type: 'delete' | 'done'; note: QuickNote } | null>(null)
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearUndo = () => {
    if (undoTimerRef.current) { clearTimeout(undoTimerRef.current); undoTimerRef.current = null }
    setUndoToast(null)
  }

  const handleDelete = (note: QuickNote) => {
    clearUndo()
    // Optimistically remove from cache; actual delete fires after 5s
    queryClient.setQueryData<QuickNote[]>(['quick-notes', businessId], (old) =>
      old?.filter((n) => n.id !== note.id) ?? [],
    )
    setUndoToast({ type: 'delete', note })
    undoTimerRef.current = setTimeout(() => {
      deleteNote.mutate(note.id)
      setUndoToast(null)
      undoTimerRef.current = null
    }, 5000)
  }

  const handleDone = (note: QuickNote, complete: boolean) => {
    toggleComplete.mutate({ id: note.id, complete })
    if (complete) {
      clearUndo()
      setUndoToast({ type: 'done', note })
      undoTimerRef.current = setTimeout(() => {
        setUndoToast(null)
        undoTimerRef.current = null
      }, 5000)
    } else {
      clearUndo()
    }
  }

  const handleUndo = useCallback(() => {
    if (!undoToast) return
    clearTimeout(undoTimerRef.current ?? undefined)
    undoTimerRef.current = null
    if (undoToast.type === 'delete') {
      // Restore the optimistically removed note
      queryClient.setQueryData<QuickNote[]>(['quick-notes', businessId], (old) =>
        old ? [undoToast.note, ...old.filter((n) => n.id !== undoToast.note.id)] : [undoToast.note],
      )
    } else {
      toggleComplete.mutate({ id: undoToast.note.id, complete: false })
    }
    setUndoToast(null)
  }, [undoToast, businessId, queryClient, toggleComplete])

  // Ctrl/Cmd+Z when panel is open (don't intercept inside contenteditable editors)
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        const inEditor = (document.activeElement as HTMLElement | null)?.closest('[contenteditable]')
        if (!inEditor && undoToast) {
          e.preventDefault()
          handleUndo()
        }
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, undoToast, handleUndo])

  // Clear pending delete timer when panel closes
  useEffect(() => {
    if (!open && undoTimerRef.current) {
      // Panel closed — commit any pending delete immediately
      clearTimeout(undoTimerRef.current)
      undoTimerRef.current = null
      if (undoToast?.type === 'delete') {
        deleteNote.mutate(undoToast.note.id)
      }
      setUndoToast(null)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Compose editor — lives at component level to persist across open/close
  const editor = useEditor({
    extensions: [StarterKit, Underline],
    editorProps: { attributes: { class: 'note-editor' } },
  })

  const composeIsEmpty = useEditorState({
    editor,
    selector: (ctx) => ctx.editor?.isEmpty ?? true,
  })

  useEffect(() => {
    if (open) setTimeout(() => editor?.commands.focus(), 60)
  }, [open, editor])

  const submit = () => {
    if (!editor || editor.isEmpty) return
    addNote.mutate({ body: editor.getHTML(), kind: 'text' })
    editor.commands.clearContent()
  }

  const handleConvertToTask = async (note: QuickNote): Promise<string | null> => {
    const title = noteToPlainText(note.body).slice(0, 120)
    if (!title) return null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('tasks')
      .insert({ title, job_id: null, assigned_to: null, due_date: null })
      .select('id')
      .single()
    if (error) return null
    toggleComplete.mutate({ id: note.id, complete: true })
    void queryClient.invalidateQueries({ queryKey: ['tasks'] })
    return data.id as string
  }

  const handleUndoConvert = async (note: QuickNote, taskId: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('tasks').delete().eq('id', taskId)
    toggleComplete.mutate({ id: note.id, complete: false })
    void queryClient.invalidateQueries({ queryKey: ['tasks'] })
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
                onDelete={() => handleDelete(n)}
                onUpdate={(html) => updateNote.mutate({ id: n.id, body: html })}
                onComplete={() => handleDone(n, true)}
                onConvertToTask={() => handleConvertToTask(n)}
                onUndoConvert={(taskId) => void handleUndoConvert(n, taskId)}
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
                        onDelete={() => handleDelete(n)}
                        onUpdate={(html) => updateNote.mutate({ id: n.id, body: html })}
                        onComplete={() => handleDone(n, false)}
                        onConvertToTask={() => handleConvertToTask(n)}
                        onUndoConvert={(taskId) => void handleUndoConvert(n, taskId)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Undo toast */}
          {undoToast && (
            <div className="mx-3 mb-2 flex items-center justify-between gap-2 rounded-lg bg-stone-800 px-3 py-2 text-xs text-white shadow">
              <span>{undoToast.type === 'delete' ? 'Note deleted' : 'Note marked done'}</span>
              <button
                onClick={handleUndo}
                className="rounded px-2 py-0.5 font-semibold text-amber-300 hover:text-amber-100"
              >
                Undo
              </button>
            </div>
          )}

          {/* Compose area */}
          <div className="shrink-0 border-t border-stone-100">
            <RichToolbar editor={editor} />

            <div className="relative">
              <EditorContent editor={editor} />
              {composeIsEmpty && recState === 'idle' && (
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
                disabled={composeIsEmpty || addNote.isPending}
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
