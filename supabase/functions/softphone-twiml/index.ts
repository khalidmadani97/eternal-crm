// TwiML App voice handler for the browser softphone (Slice 13). The browser
// leg connects here; we dial the client with the business caller ID, the
// same pre-connect recorded-call announcement whisper, the same recording
// callback, and the same record_call() logging path as bridging — no
// parallel write path. Twilio-signature validated.

import {
  publicFunctionUrl,
  serviceClient,
  twilioEnv,
  twiml,
  validateTwilioSignature,
} from '../_shared/twilio.ts'

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const env = twilioEnv()
  if (!env) return new Response('Not configured', { status: 503 })

  const url = new URL(req.url)
  const params = Object.fromEntries((await req.formData()).entries()) as Record<string, string>
  const valid = await validateTwilioSignature(
    publicFunctionUrl('softphone-twiml', url.search),
    params,
    req.headers.get('X-Twilio-Signature'),
    env.authToken,
  )
  if (!valid) return new Response('Invalid signature', { status: 403 })

  // Custom params from device.connect({ params: { To, contactId, jobId } }).
  const to = params.To
  const contactId = params.contactId
  const jobId = params.jobId || null
  if (!to || !contactId) return twiml('<Say>Missing destination.</Say>')

  const sb = serviceClient()
  await sb.rpc('record_call', {
    p_provider_call_sid: params.CallSid,
    p_direction: 'outbound',
    p_from_number: env.businessNumber,
    p_to_number: to,
    p_contact_id: contactId,
    p_job_id: jobId,
    p_started_at: new Date().toISOString(),
    p_body: 'Outbound call (softphone)',
  })

  const whisperQuery =
    `?whisper=1&to=${encodeURIComponent(to)}&contactId=${contactId}` + (jobId ? `&jobId=${jobId}` : '')
  const query = `?to=${encodeURIComponent(to)}&contactId=${contactId}` + (jobId ? `&jobId=${jobId}` : '')
  return twiml(
    `<Dial callerId="${env.businessNumber}" record="record-from-answer-dual" ` +
      `recordingStatusCallback="${publicFunctionUrl('call-status', `?type=recording&contactId=${contactId}${jobId ? `&jobId=${jobId}` : ''}`)}" ` +
      `action="${publicFunctionUrl('call-status', `${query}&action=1`)}">` +
      `<Number url="${publicFunctionUrl('call-twiml', whisperQuery)}">${to}</Number>` +
      `</Dial>`,
  )
})
