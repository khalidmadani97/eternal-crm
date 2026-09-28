import { useEffect, useRef, useState } from 'react'
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
    onSuccess: (_d, _v, _c) => {
      void queryClient.invalidateQueries({ queryKey: ['quick-notes'] })
    },
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

type RecState = 'idle' | 'recording' | 'uploading'

export function QuickNotepad() {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [recState, setRecState] = useState<RecState>('idle')
  const [recError, setRecError] = useState<string | null>(null)
  const mediaRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const { data: notes, isPending } = useQuickNotes()
  const addNote = useAddNote()
  const deleteNote = useDeleteNote()

  const submit = () => {
    const text = draft.trim()
    if (!text) return
    addNote.mutate({ body: text, kind: 'text' })
    setDraft('')
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

      // Try to transcribe; fall back to a placeholder if not configured
      const { data: txData } = await supabase.functions.invoke('transcribe', { body: { path: filename } })
      const transcript: string = txData?.text ?? '[voice note — transcription unavailable]'

      addNote.mutate({ body: transcript, kind: 'voice', voicePath: filename })
    } catch (e) {
      setRecError((e as Error).message)
    } finally {
      setRecState('idle')
    }
  }

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])

  const noteCount = notes?.length ?? 0

  return (
    <>
      {/* Floating button — bottom-left, above Sara's bottom-right bubble */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Quick notepad"
        className={`fixed bottom-5 left-5 z-30 flex h-11 w-11 items-center justify-center rounded-full shadow-lg ring-2 transition-transform hover:scale-110 ${
          noteCount > 0
            ? 'bg-amber-600 ring-amber-400/70 text-white'
            : 'bg-white ring-stone-300/70 text-stone-600'
        }`}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
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
        <div className="fixed bottom-20 left-5 z-30 flex h-[min(28rem,calc(100dvh-7rem))] w-80 max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3">
            <div>
              <span className="text-sm font-semibold text-stone-800">Quick notes</span>
              <span className="ml-2 text-xs text-stone-400">Sara reads these first</span>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-stone-400 hover:text-stone-700"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          {/* Note list */}
          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
            {isPending && <p className="py-4 text-center text-sm text-stone-400">Loading…</p>}
            {!isPending && noteCount === 0 && (
              <p className="py-6 text-center text-sm text-stone-400">
                Nothing yet — add a note or record a voice message.
              </p>
            )}
            {notes?.map((n) => (
              <div key={n.id} className="group flex gap-2 rounded-lg border border-stone-100 bg-stone-50 px-3 py-2">
                {n.kind === 'voice' && (
                  <span className="mt-0.5 shrink-0 text-xs text-amber-600">🎙</span>
                )}
                <p className="flex-1 text-sm text-stone-800 whitespace-pre-wrap break-words">{n.body}</p>
                <button
                  onClick={() => deleteNote.mutate(n.id)}
                  className="shrink-0 text-stone-200 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label="Delete note"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          {/* Input area */}
          <div className="border-t border-stone-100 p-3 space-y-2">
            {recError && <p className="text-xs text-red-500">{recError}</p>}
            <div className="flex gap-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    submit()
                  }
                }}
                placeholder="Type a note… (Enter to save)"
                rows={2}
                className="flex-1 resize-none rounded-lg border border-stone-300 px-2.5 py-1.5 text-sm focus:border-amber-600 focus:outline-none"
                disabled={recState !== 'idle'}
              />
              {/* Voice record button */}
              <button
                type="button"
                onClick={recState === 'idle' ? startRecording : recState === 'recording' ? stopRecording : undefined}
                disabled={recState === 'uploading'}
                aria-label={recState === 'recording' ? 'Stop recording' : 'Record voice note'}
                className={`flex h-full w-10 shrink-0 items-center justify-center rounded-lg border transition-colors ${
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
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="3" width="10" height="10" rx="2"/></svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="5" y="1" width="6" height="9" rx="3"/>
                    <path d="M2 8c0 3.3 2.7 6 6 6s6-2.7 6-6" strokeLinecap="round"/>
                    <line x1="8" y1="14" x2="8" y2="15.5" strokeLinecap="round"/>
                  </svg>
                )}
              </button>
            </div>
            <button
              onClick={submit}
              disabled={!draft.trim() || addNote.isPending}
              className="w-full rounded-lg bg-stone-900 py-1.5 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-40"
            >
              {addNote.isPending ? 'Saving…' : 'Save note'}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
