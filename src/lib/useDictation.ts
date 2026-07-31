import { useEffect, useRef, useState } from 'react'

// Voice dictation via the browser's built-in Web Speech API (Slice 17).
// On-device / browser-native: no dependency, no API key, nothing leaves the
// stack we already have. Finalised phrases are handed to the caller to
// append to a text field; the interim phrase is exposed for live feedback.
// Unsupported browsers (Firefox) simply don't show the mic.

interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onend: (() => void) | null
  onerror: ((event: { error: string }) => void) | null
}

interface SpeechRecognitionEventLike {
  resultIndex: number
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function useDictation(onFinalText: (text: string) => void) {
  const supported = getRecognitionCtor() !== null
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [error, setError] = useState<string | null>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const onFinalRef = useRef(onFinalText)
  onFinalRef.current = onFinalText

  useEffect(() => {
    return () => recognitionRef.current?.stop()
  }, [])

  const start = () => {
    const Ctor = getRecognitionCtor()
    if (!Ctor) return
    setError(null)
    const recognition = new Ctor()
    recognition.lang = 'en-CA'
    recognition.continuous = true
    recognition.interimResults = true
    recognition.onresult = (event) => {
      let interimText = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) onFinalRef.current(result[0].transcript.trim())
        else interimText += result[0].transcript
      }
      setInterim(interimText)
    }
    recognition.onend = () => {
      setListening(false)
      setInterim('')
    }
    recognition.onerror = (event) => {
      if (event.error === 'not-allowed') setError('Microphone access was blocked.')
      else if (event.error !== 'aborted' && event.error !== 'no-speech')
        setError(`Dictation error: ${event.error}`)
    }
    recognitionRef.current = recognition
    recognition.start()
    setListening(true)
  }

  const stop = () => {
    recognitionRef.current?.stop()
    setListening(false)
    setInterim('')
  }

  return { supported, listening, interim, error, start, stop }
}
