import { useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import { supabase } from '../lib/supabase'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useMyMembership } from '../features/settings/api'

interface QuickNote {
  id: string
  body: string
  kind: 'text' | 'voice'
  created_at: string
}

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
        .select('id, body, kind, created_at')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false })
        .limit(30)
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

// Toolbar button — onMouseDown + preventDefault keeps editor focused
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

const isHtmlBody = (s: string) => s.trimStart().startsWith('<')

function NoteCard({ note, onDelete }: { note: QuickNote; onDelete: () => void }) {
  return (
    <div className="group relative rounded-lg border border-stone-100 bg-stone-50 px-3 py-2.5">
      <div className="pr-5">
        {note.kind === 'voice' && (
          <span className="mr-1.5 text-xs text-amber-600">🎙</span>
        )}
        {note.kind === 'voice' || !isHtmlBody(note.body) ? (
          <span className="text-sm text-stone-800 whitespace-pre-wrap break-words">{note.body}</span>
        ) : (
          <div
            className="note-body text-sm text-stone-800 break-words"
            dangerouslySetInnerHTML={{ __html: note.body }}
          />
        )}
      </div>
      <button
        onClick={onDelete}
        className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded text-stone-300 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
        aria-label="Delete note"
      >
        ×
      </button>
    </div>
  )
}

type RecState = 'idle' | 'recording' | 'uploading'

export function QuickNotepad() {
  const [open, setOpen] = useState(false)
  const [recState, setRecState] = useState<RecState>('idle')
  const [recError, setRecError] = useState<string | null>(null)
  const mediaRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const { data: notes, isPending } = useQuickNotes()
  const addNote = useAddNote()
  const deleteNote = useDeleteNote()

  // Editor lives at the component level so it persists across panel open/close
  const editor = useEditor({
    extensions: [StarterKit, Underline],
    editorProps: {
      attributes: { class: 'note-editor' },
    },
  })

  useEffect(() => {
    if (open) setTimeout(() => editor?.commands.focus(), 60)
  }, [open, editor])

  const submit = () => {
    if (!editor || editor.isEmpty) return
    addNote.mutate({ body: editor.getHTML(), kind: 'text' })
    editor.commands.clearContent()
  }

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

  const noteCount = notes?.length ?? 0

  return (
    <>
      {/* Floating trigger button */}
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

      {/* Floating panel */}
      {open && (
        <div className="fixed bottom-20 left-5 z-30 flex h-[min(36rem,calc(100dvh-7rem))] w-80 max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl">
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
            {!isPending && noteCount === 0 && (
              <p className="py-6 text-center text-sm text-stone-400">
                Nothing yet — jot a note below or tap the mic.
              </p>
            )}
            {notes?.map((n) => (
              <NoteCard key={n.id} note={n} onDelete={() => deleteNote.mutate(n.id)} />
            ))}
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
