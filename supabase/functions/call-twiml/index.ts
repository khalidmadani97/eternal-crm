// TwiML for the bridge (Slice 10). Twilio fetches this when the staff cell
// answers. The <Number url> whisper leg plays the recorded-call announcement
// to the CLIENT before connecting — hardcoded here, not disable-able from
// the UI (PIPEDA). Signature-validated; 403 otherwise.

import {
  publicFunctionUrl,
  serviceClient,
  twilioEnv,
  twiml,
  validateTwilioSignature,
} from '../_shared/twilio.ts'

const ANNOUNCEMENT =
  'This call may be recorded for quality and record keeping. By continuing you consent to the recording.'

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const env = twilioEnv()
  if (!env) return new Response('Not configured', { status: 503 })

  const url = new URL(req.url)
  const params = Object.fromEntries((await req.formData()).entries()) as Record<string, string>
  const publicUrl = publicFunctionUrl('call-twiml', url.search)
  const valid = await validateTwilioSignature(
    publicUrl,
    params,
    req.headers.get('X-Twilio-Signature'),
    env.authToken,
  )
  if (!valid) return new Response('Invalid signature', { status: 403 })

  const to = url.searchParams.get('to') ?? ''
  const contactId = url.searchParams.get('contactId') ?? ''
  const jobId = url.searchParams.get('jobId')

  if (url.searchParams.get('whisper') === '1') {
    // Client leg answered: play the announcement and log the consent moment.
    const sb = serviceClient()
    const parentSid = params.ParentCallSid ?? params.CallSid
    await sb.from('consent_records').insert({
      contact_id: contactId,
      phone_number: to,
      channel: 'call_recording',
      status: 'implied',
      source: 'pre_connect_announcement',
      evidence: { call_sid: parentSid, announcement: ANNOUNCEMENT },
      granted_at: new Date().toISOString(),
    })
    await sb.rpc('record_call', {
      p_provider_call_sid: parentSid,
      p_direction: 'outbound',
      p_from_number: env.businessNumber,
      p_to_number: to,
      p_contact_id: contactId,
      p_consent_announced: true,
    })
    return twiml(`<Say voice="alice">${ANNOUNCEMENT}</Say>`)
  }

  const whisperQuery =
    `?whisper=1&to=${encodeURIComponent(to)}&contactId=${contactId}` + (jobId ? `&jobId=${jobId}` : '')
  const recordingCallback = publicFunctionUrl(
    'call-status',
    `?type=recording&contactId=${contactId}` + (jobId ? `&jobId=${jobId}` : ''),
  )
  return twiml(
    `<Dial callerId="${env.businessNumber}" record="record-from-answer-dual" ` +
      `recordingStatusCallback="${recordingCallback}">` +
      `<Number url="${publicFunctionUrl('call-twiml', whisperQuery)}">${to}</Number>` +
      `</Dial>`,
  )
})
