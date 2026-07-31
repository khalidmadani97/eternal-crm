// Voice-note transcription (Slice 23, DECISIONS 026). Staff-only. Takes a
// storage path in job-files, runs it through OpenAI Whisper, returns the
// text. Without OPENAI_API_KEY it returns 503 and the UI falls back to the
// browser's live dictation draft — the audio itself is always kept.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { json, requireStaff } from '../_shared/twilio.ts'

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const auth = await requireStaff(req)
  if (auth instanceof Response) return auth

  let path: unknown
  try {
    ;({ path } = await req.json())
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  if (typeof path !== 'string' || !path.startsWith('voice-notes/')) {
    return json({ error: 'path must be a voice-notes storage path' }, 400)
  }

  const apiKey = Deno.env.get('OPENAI_API_KEY')
  if (!apiKey) {
    return json({ error: 'Transcription not configured — set OPENAI_API_KEY' }, 503)
  }

  const service = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
  const { data: audio, error: downloadError } = await service.storage
    .from('job-files')
    .download(path)
  if (downloadError) return json({ error: `Could not read audio: ${downloadError.message}` }, 500)

  const form = new FormData()
  const ext = path.split('.').pop() ?? 'webm'
  form.append('file', audio, `note.${ext}`)
  form.append('model', 'whisper-1')
  form.append('language', 'en')

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  })
  const result = await res.json()
  if (!res.ok) {
    return json({ error: `Whisper: ${result?.error?.message ?? res.status}` }, 502)
  }
  return json({ text: (result.text ?? '').trim() })
})
