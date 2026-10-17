import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { useVoiceRecorder } from '../../../lib/useVoiceRecorder'
import { useAuth } from '../../auth/AuthProvider'
import { useAddNote } from '../api'

type Phase = 'idle' | 'recording' | 'processing' | 'done'

export function CallNotetaker({ jobId, contactId }: { jobId: string; contactId?: string | null }) {
  const { session } = useAuth()
  const recorder = useVoiceRecorder()
  const addNote = useAddNote(jobId, contactId)

  const [phase, setPhase] = useState<Phase>('idle')
  const [seconds, setSeconds] = useState(0)
  const [transcript, setTranscript] = useState<string | null>(null)
  const [summary, setSummary] = useState('')
  const [audioPath, setAudioPath] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [showTranscript, setShowTranscript] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (phase === 'recording') {
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [phase])

  const fmtTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  const startRecording = async () => {
    setError(null)
    setSaved(false)
    setTranscript(null)
    setSummary('')
    setAudioPath(null)
    setSeconds(0)
    setShowTranscript(false)
    await recorder.start()
    if (!recorder.error) setPhase('recording')
  }

  const stopRecording = async () => {
    setPhase('processing')
    const blob = await recorder.stop()
    if (!blob) {
      setError('No audio captured.')
      setPhase('idle')
      return
    }
    try {
      const ext = blob.type.includes('mp4') ? 'm4a' : 'webm'
      const path = `voice-notes/${crypto.randomUUID()}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('job-files')
        .upload(path, blob, { contentType: blob.type })
      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`)
      setAudioPath(path)

      const { data, error: fnError } = await supabase.functions.invoke('transcribe', {
        body: { path, summarize: true },
      })
      if (fnError) throw new Error(fnError.message)

      const text: string = (data?.text ?? '').trim()
      const aiSummary: string = (data?.summary ?? '').trim()
      setTranscript(text || null)
      setSummary(aiSummary || text || 'No speech detected.')
      setPhase('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Processing failed')
      setPhase('idle')
    }
  }

  const saveNote = () => {
    if (!session) return
    const body = summary.trim()
    if (!body) return
    addNote.mutate(
      { body, userId: session.user.id, audioPath: audioPath ?? undefined },
      {
        onSuccess: () => {
          setSaved(true)
          setTimeout(() => {
            setPhase('idle')
            setSaved(false)
          }, 1800)
        },
        onError: (e) => setError(e.message),
      },
    )
  }

  const discard = () => {
    recorder.cancel()
    setPhase('idle')
    setError(null)
    setSeconds(0)
    setTranscript(null)
    setSummary('')
    setAudioPath(null)
    setSaved(false)
  }

  if (!recorder.supported) return null

  return (
    <section className="rounded-lg border border-stone-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">AI Notetaker</h2>

      {phase === 'idle' && (
        <button
          onClick={() => void startRecording()}
          className="flex items-center gap-2 rounded-lg border border-stone-300 px-4 py-2.5 text-sm font-medium text-stone-700 hover:border-red-400 hover:bg-red-50 hover:text-red-700"
        >
          <span className="h-2.5 w-2.5 rounded-full bg-stone-400" />
          Start recording
        </button>
      )}

      {phase === 'recording' && (
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-2 text-sm font-medium text-red-600">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
            Recording {fmtTime(seconds)}
          </span>
          <button
            onClick={() => void stopRecording()}
            className="rounded-lg border border-red-400 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
          >
            Stop & summarise
          </button>
          <button onClick={discard} className="text-sm text-stone-400 hover:text-stone-600">
            Cancel
          </button>
        </div>
      )}

      {phase === 'processing' && (
        <p className="flex items-center gap-2 text-sm text-stone-500">
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
            <path d="M12 2a10 10 0 0 1 10 10" />
          </svg>
          Transcribing and summarising…
        </p>
      )}

      {phase === 'done' && !saved && (
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-500">AI call notes — edit before saving</label>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={5}
              className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-800 focus:border-amber-400 focus:outline-none"
            />
          </div>
          {transcript && (
            <div>
              <button
                onClick={() => setShowTranscript((v) => !v)}
                className="text-xs text-stone-400 underline hover:text-stone-600"
              >
                {showTranscript ? 'Hide' : 'Show'} full transcript
              </button>
              {showTranscript && (
                <p className="mt-1 whitespace-pre-wrap rounded border border-stone-100 bg-stone-50 px-3 py-2 text-xs text-stone-600">
                  {transcript}
                </p>
              )}
            </div>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={saveNote}
              disabled={addNote.isPending || !summary.trim()}
              className="rounded bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
            >
              {addNote.isPending ? 'Saving…' : 'Save as note'}
            </button>
            <button onClick={discard} className="text-sm text-stone-400 hover:text-stone-600">
              Discard
            </button>
          </div>
        </div>
      )}

      {phase === 'done' && saved && (
        <p className="text-sm text-green-700">Note saved to timeline.</p>
      )}

      {(error ?? recorder.error) && (
        <p className="mt-2 text-sm text-red-600">{error ?? recorder.error}</p>
      )}
    </section>
  )
}
