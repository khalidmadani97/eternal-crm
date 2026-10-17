// Voice-note transcription (Slice 23, DECISIONS 026). Staff-only. Takes a
// storage path in job-files, runs it through OpenAI Whisper, returns the
// text. Without OPENAI_API_KEY it returns 503 and the UI falls back to the
// browser's live dictation draft — the audio itself is always kept.
// When summarize:true is passed an extra GPT-4o-mini call extracts call notes.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { CORS_HEADERS, checkAiCredits, json, logAiUsage, requireStaff } from '../_shared/twilio.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const auth = await requireStaff(req)
  if (auth instanceof Response) return auth

  let path: unknown, summarize: unknown
  try {
    ;({ path, summarize } = await req.json())
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  if (typeof path !== 'string' || !path.startsWith('voice-notes/')) {
    return json({ error: 'path must be a voice-notes storage path' }, 400)
  }
  const wantSummary = summarize === true

  // OpenAI by default; point TRANSCRIBE_API_BASE at any OpenAI-compatible
  // Whisper host (e.g. Groq, ~3x cheaper) without code changes.
  const apiKey = Deno.env.get('TRANSCRIBE_API_KEY') ?? Deno.env.get('OPENAI_API_KEY')
  if (!apiKey) {
    return json({ error: 'Transcription not configured — set OPENAI_API_KEY (or TRANSCRIBE_API_KEY)' }, 503)
  }
  const apiBase = Deno.env.get('TRANSCRIBE_API_BASE') ?? 'https://api.openai.com/v1'
  const sttModel = Deno.env.get('TRANSCRIBE_MODEL') ?? 'whisper-1'

  const service = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const credits = await checkAiCredits(service, auth.userId)
  if (!credits.allowed) {
    return json(
      {
        error: `AI credits used up for this month (${credits.used}/${credits.cap}) — recording saved without transcription.`,
        usage: credits,
      },
      429,
    )
  }

  const { data: audio, error: downloadError } = await service.storage
    .from('job-files')
    .download(path)
  if (downloadError) return json({ error: `Could not read audio: ${downloadError.message}` }, 500)

  const form = new FormData()
  const ext = path.split('.').pop() ?? 'webm'
  form.append('file', audio, `note.${ext}`)
  form.append('model', sttModel)
  form.append('language', 'en')

  const res = await fetch(`${apiBase}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  })
  const result = await res.json()
  if (!res.ok) {
    return json({ error: `Whisper: ${result?.error?.message ?? res.status}` }, 502)
  }
  const text: string = (result.text ?? '').trim()
  await logAiUsage(service, auth.userId, 'transcribe', sttModel, null, null)

  if (!wantSummary || !text) {
    return json({ text, usage: { used: credits.used + 1, cap: credits.cap } })
  }

  // GPT-4o-mini pass: extract structured call notes from the transcript.
  const chatRes = await fetch(`${apiBase}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0,
      max_tokens: 300,
      messages: [
        {
          role: 'system',
          content:
            'You extract key call notes for an interior renovation company CRM. ' +
            'From the transcript, extract in plain text bullet points (no markdown headers): ' +
            'what the customer wants, location/address, budget or price mentions, timeline or urgency, ' +
            'and any follow-up actions agreed. Omit categories that were not mentioned. ' +
            'Be concise — 80 words max.',
        },
        { role: 'user', content: text },
      ],
    }),
  })
  const chatResult = await chatRes.json()
  const summary: string = chatResult?.choices?.[0]?.message?.content?.trim() ?? ''
  await logAiUsage(service, auth.userId, 'summarize', 'gpt-4o-mini', null, null)

  return json({ text, summary, usage: { used: credits.used + 2, cap: credits.cap } })
})
