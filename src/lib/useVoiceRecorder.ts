import { useRef, useState } from 'react'

// Records real audio via MediaRecorder (Slice 23). The blob is kept whatever
// happens to transcription — the recording is the source of truth.

function pickMimeType(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
  for (const type of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) return type
  }
  return ''
}

export function useVoiceRecorder() {
  const supported = typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices
  const [recording, setRecording] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const stopResolveRef = useRef<((blob: Blob | null) => void) | null>(null)

  const start = async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = pickMimeType()
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      chunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        stopResolveRef.current?.(blob.size > 0 ? blob : null)
        stopResolveRef.current = null
      }
      recorder.start()
      recorderRef.current = recorder
      setRecording(true)
    } catch (e) {
      setError(
        e instanceof DOMException && e.name === 'NotAllowedError'
          ? 'Microphone access was blocked.'
          : 'Could not start recording.',
      )
    }
  }

  /** Stops and resolves with the recorded blob (null if nothing captured). */
  const stop = (): Promise<Blob | null> => {
    const recorder = recorderRef.current
    setRecording(false)
    if (!recorder || recorder.state === 'inactive') return Promise.resolve(null)
    return new Promise((resolve) => {
      stopResolveRef.current = resolve
      recorder.stop()
    })
  }

  const cancel = () => {
    const recorder = recorderRef.current
    setRecording(false)
    stopResolveRef.current = null
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = () => recorder.stream.getTracks().forEach((t) => t.stop())
      recorder.stop()
    }
  }

  return { supported, recording, error, start, stop, cancel }
}
