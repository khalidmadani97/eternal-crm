import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useDictation } from '../lib/useDictation'
import { useVoiceRecorder } from '../lib/useVoiceRecorder'

export interface NoteSubmission {
  body: string
  audioPath: string | null
}

interface Props {
  placeholder?: string
  pending: boolean
  errorMessage: string | null
  onSubmit: (note: NoteSubmission) => Promise<void> | void
}

/**
 * Note input with voice memos (Slice 23). The mic records REAL audio and
 * live-drafts text via the browser engine; on stop the audio uploads and is
 * transcribed by Whisper when configured (better quality), falling back to
 * the live draft otherwise. The recording is attached to the note either
 * way, and the text stays editable before saving.
 */
export function NoteComposer({ placeholder = 'Add a note…', pending, errorMessage, onSubmit }: Props) {
  const [note, setNote] = useState('')
  const [audioPath, setAudioPath] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const dictation = useDictation((text) =>
    setNote((current) => (current ? `${current} ${text}` : text)),
  )
  const recorder = useVoiceRecorder()

  const startVoice = async () => {
    setVoiceError(null)
    await recorder.start()
    if (dictation.supported) dictation.start()
  }

  const stopVoice = async () => {
    if (dictation.supported) dictation.stop()
    const liveDraft = note
    const blob = await recorder.stop()
    if (!blob) return
    setProcessing(true)
    try {
      const ext = blob.type.includes('mp4') ? 'm4a' : 'webm'
      const path = `voice-notes/${crypto.randomUUID()}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('job-files')
        .upload(path, blob, { contentType: blob.type })
      if (uploadError) throw new Error(`Could not save the recording: ${uploadError.message}`)
      setAudioPath(path)

      // Whisper when configured; otherwise the live draft stands.
      const { data, error } = await supabase.functions.invoke('transcribe', { body: { path } })
      if (!error && data?.text) {
        setNote(data.text)
      } else if (!liveDraft.trim()) {
        setVoiceError('Transcription unavailable — recording attached; type the note text.')
      }
    } catch (e) {
      setVoiceError(e instanceof Error ? e.message : 'Recording failed')
    } finally {
      setProcessing(false)
    }
  }

  const submit = async () => {
    const body = note.trim()
    if (!body && !audioPath) return
    if (recorder.recording) await stopVoice()
    await onSubmit({ body: body || '(voice note)', audioPath })
    setNote('')
    setAudioPath(null)
  }

  const busy = processing || pending

  return (
    <div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit()
            }}
            placeholder={
              recorder.recording ? 'Recording… speak now' : processing ? 'Transcribing…' : placeholder
            }
            className={`w-full rounded border px-3 py-2 pr-10 text-sm focus:outline-none ${
              recorder.recording
                ? 'border-red-400 focus:border-red-500'
                : 'border-stone-300 focus:border-amber-600'
            }`}
          />
          {recorder.supported && (
            <button
              type="button"
              onClick={() => void (recorder.recording ? stopVoice() : startVoice())}
              disabled={processing}
              title={recorder.recording ? 'Stop recording' : 'Record a voice note'}
              aria-label={recorder.recording ? 'Stop recording' : 'Record a voice note'}
              className={`absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-sm leading-none ${
                recorder.recording
                  ? 'animate-pulse bg-red-100 text-red-700'
                  : 'text-stone-400 hover:bg-stone-100 hover:text-stone-700'
              } disabled:opacity-50`}
            >
              {recorder.recording ? '⏹' : '🎤'}
            </button>
          )}
        </div>
        <button
          onClick={() => void submit()}
          disabled={busy || (!note.trim() && !audioPath)}
          className="rounded bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
        >
          {processing ? 'Transcribing…' : pending ? 'Adding…' : 'Add'}
        </button>
      </div>
      {audioPath && !recorder.recording && (
        <p className="mt-1 flex items-center gap-2 text-xs text-stone-500">
          🎙 Recording attached
          <button
            onClick={() => setAudioPath(null)}
            className="text-stone-400 underline hover:text-red-600"
          >
            remove
          </button>
        </p>
      )}
      {recorder.recording && dictation.interim && (
        <p className="mt-1 text-sm italic text-stone-400">{dictation.interim}…</p>
      )}
      {(voiceError ?? recorder.error ?? dictation.error) && (
        <p className="mt-1 text-sm text-red-600">
          {voiceError ?? recorder.error ?? dictation.error}
        </p>
      )}
      {errorMessage && <p className="mt-1 text-sm text-red-600">{errorMessage}</p>}
    </div>
  )
}
