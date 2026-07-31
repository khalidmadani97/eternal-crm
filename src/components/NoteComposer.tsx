import { useState } from 'react'
import { useDictation } from '../lib/useDictation'

interface Props {
  placeholder?: string
  pending: boolean
  errorMessage: string | null
  onSubmit: (body: string) => Promise<void> | void
}

/** Note input with voice dictation (Slice 17). The mic streams speech into
 *  the field — editable before saving, so a mangled word never sticks. */
export function NoteComposer({ placeholder = 'Add a note…', pending, errorMessage, onSubmit }: Props) {
  const [note, setNote] = useState('')
  const dictation = useDictation((text) =>
    setNote((current) => (current ? `${current} ${text}` : text)),
  )

  const submit = async () => {
    const body = note.trim()
    if (!body) return
    if (dictation.listening) dictation.stop()
    await onSubmit(body)
    setNote('')
  }

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
            placeholder={dictation.listening ? 'Listening…' : placeholder}
            className={`w-full rounded border px-3 py-2 pr-10 text-sm focus:outline-none ${
              dictation.listening
                ? 'border-red-400 focus:border-red-500'
                : 'border-stone-300 focus:border-amber-600'
            }`}
          />
          {dictation.supported && (
            <button
              type="button"
              onClick={() => (dictation.listening ? dictation.stop() : dictation.start())}
              title={dictation.listening ? 'Stop dictation' : 'Dictate a note'}
              aria-label={dictation.listening ? 'Stop dictation' : 'Dictate a note'}
              className={`absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-sm leading-none ${
                dictation.listening
                  ? 'animate-pulse bg-red-100 text-red-700'
                  : 'text-stone-400 hover:bg-stone-100 hover:text-stone-700'
              }`}
            >
              {dictation.listening ? '⏹' : '🎤'}
            </button>
          )}
        </div>
        <button
          onClick={() => void submit()}
          disabled={pending || !note.trim()}
          className="rounded bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
        >
          {pending ? 'Adding…' : 'Add'}
        </button>
      </div>
      {dictation.listening && dictation.interim && (
        <p className="mt-1 text-sm italic text-stone-400">{dictation.interim}…</p>
      )}
      {dictation.error && <p className="mt-1 text-sm text-red-600">{dictation.error}</p>}
      {errorMessage && <p className="mt-1 text-sm text-red-600">{errorMessage}</p>}
    </div>
  )
}
