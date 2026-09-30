import { useEffect, useRef, useState } from 'react'
import { useEditor, useEditorState, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import { supabase } from '../lib/supabase'
import { useDictation } from '../lib/useDictation'
import { useVoiceRecorder } from '../lib/useVoiceRecorder'
import { RichToolbar } from './RichToolbar'

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

export function NoteComposer({ placeholder = 'Add a note…', pending, errorMessage, onSubmit }: Props) {
  const [audioPath, setAudioPath] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const [voiceError, setVoiceError] = useState<string | null>(null)

  // Keep a ref to the editor so dictation callback can access it without
  // a stale closure (dictation is set up before useEditor returns).
  const editorRef = useRef<Editor | null>(null)

  const dictation = useDictation((text) => {
    editorRef.current?.chain().focus().insertContent(text + ' ').run()
  })

  const editor = useEditor({
    extensions: [StarterKit, Underline],
    editorProps: { attributes: { class: 'note-editor' } },
  })

  useEffect(() => { editorRef.current = editor ?? null }, [editor])

  const editorIsEmpty = useEditorState({
    editor,
    selector: (ctx) => ctx.editor?.isEmpty ?? true,
  })

  const recorder = useVoiceRecorder()

  const startVoice = async () => {
    setVoiceError(null)
    await recorder.start()
    if (dictation.supported) dictation.start()
  }

  const stopVoice = async () => {
    if (dictation.supported) dictation.stop()
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

      const { data, error } = await supabase.functions.invoke('transcribe', { body: { path } })
      if (!error && data?.text) {
        // Insert transcript into editor (user can then format it)
        editor?.commands.setContent(`<p>${data.text as string}</p>`)
        editor?.commands.focus('end')
      } else if (editor?.isEmpty) {
        setVoiceError('Transcription unavailable — recording attached; type the note text.')
      }
    } catch (e) {
      setVoiceError(e instanceof Error ? e.message : 'Recording failed')
    } finally {
      setProcessing(false)
    }
  }

  const submit = async () => {
    const isEmpty = !editor || editor.isEmpty
    if (isEmpty && !audioPath) return
    if (recorder.recording) await stopVoice()
    const body = isEmpty ? '(voice note)' : editor!.getHTML()
    await onSubmit({ body, audioPath })
    editor?.commands.clearContent()
    setAudioPath(null)
  }

  const busy = processing || pending

  return (
    <div>
      {/* Editor box */}
      <div className={`rounded-lg border transition-colors focus-within:border-amber-400 ${
        recorder.recording ? 'border-red-300' : 'border-stone-200'
      }`}>
        <RichToolbar editor={editor} />
        <div className="relative">
          <EditorContent editor={editor} />
          {editorIsEmpty && !recorder.recording && !processing && (
            <p className="pointer-events-none absolute left-2.5 top-2 select-none text-sm text-stone-400">
              {placeholder}
            </p>
          )}
          {(recorder.recording || processing) && (
            <p className="pointer-events-none absolute left-2.5 top-2 select-none text-sm text-red-400">
              {processing ? 'Transcribing…' : 'Recording… speak now'}
            </p>
          )}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="mt-2 flex items-center gap-2">
        {recorder.supported && (
          <button
            type="button"
            onClick={() => void (recorder.recording ? stopVoice() : startVoice())}
            disabled={processing}
            title={recorder.recording ? 'Stop recording' : 'Record a voice note'}
            aria-label={recorder.recording ? 'Stop recording' : 'Record a voice note'}
            className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
              recorder.recording
                ? 'animate-pulse border-red-400 bg-red-50 text-red-600'
                : 'border-stone-300 bg-white text-stone-500 hover:border-amber-500 hover:text-amber-600'
            } disabled:opacity-50`}
          >
            {recorder.recording ? (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><rect x="2" y="2" width="8" height="8" rx="1.5"/></svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="4" y="1" width="6" height="8" rx="3"/>
                <path d="M1.5 7c0 3.04 2.1 5 5.5 5s5.5-1.96 5.5-5" strokeLinecap="round"/>
                <line x1="7" y1="12" x2="7" y2="13.5" strokeLinecap="round"/>
              </svg>
            )}
          </button>
        )}

        {dictation.interim && (
          <p className="flex-1 truncate text-xs italic text-stone-400">{dictation.interim}…</p>
        )}
        {!dictation.interim && <div className="flex-1" />}

        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || (editorIsEmpty && !audioPath)}
          className="rounded bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
        >
          {processing ? 'Transcribing…' : pending ? 'Adding…' : 'Add note'}
        </button>
      </div>

      {audioPath && !recorder.recording && (
        <p className="mt-1 flex items-center gap-2 text-xs text-stone-500">
          🎙 Recording attached
          <button onClick={() => setAudioPath(null)} className="text-stone-400 underline hover:text-red-600">
            remove
          </button>
        </p>
      )}
      {(voiceError ?? recorder.error ?? dictation.error) && (
        <p className="mt-1 text-sm text-red-600">{voiceError ?? recorder.error ?? dictation.error}</p>
      )}
      {errorMessage && <p className="mt-1 text-sm text-red-600">{errorMessage}</p>}
    </div>
  )
}
