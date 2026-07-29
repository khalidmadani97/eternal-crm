// Call webhooks (Slice 10): completion writes the call via record_call()
// (idempotent on the SID); the recording callback copies the recording into
// the private comms bucket and deletes the Twilio-hosted copy — we control
// retention, nothing stays at Twilio.

import {
  publicFunctionUrl,
  serviceClient,
  twilioEnv,
  validateTwilioSignature,
} from '../_shared/twilio.ts'

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const env = twilioEnv()
  if (!env) return new Response('Not configured', { status: 503 })

  const url = new URL(req.url)
  const params = Object.fromEntries((await req.formData()).entries()) as Record<string, string>
  const valid = await validateTwilioSignature(
    publicFunctionUrl('call-status', url.search),
    params,
    req.headers.get('X-Twilio-Signature'),
    env.authToken,
  )
  if (!valid) return new Response('Invalid signature', { status: 403 })

  const contactId = url.searchParams.get('contactId') ?? ''
  const jobId = url.searchParams.get('jobId')
  const sb = serviceClient()

  if (url.searchParams.get('type') === 'recording') {
    const recordingSid = params.RecordingSid
    const callSid = params.CallSid
    if (!recordingSid || !callSid || params.RecordingStatus !== 'completed') {
      return new Response('ok', { status: 200 })
    }

    // Copy the recording into our bucket…
    const mp3 = await fetch(`${params.RecordingUrl}.mp3`, {
      headers: { Authorization: `Basic ${btoa(`${env.accountSid}:${env.authToken}`)}` },
    })
    if (!mp3.ok) return new Response(`Recording fetch failed: ${mp3.status}`, { status: 500 })
    const bytes = new Uint8Array(await mp3.arrayBuffer())

    const callId = await sb.rpc('record_call', {
      p_provider_call_sid: callSid,
      p_direction: 'outbound',
      p_from_number: env.businessNumber,
      p_to_number: params.To ?? '',
      p_contact_id: contactId,
      p_job_id: jobId,
    })
    if (callId.error) return new Response(callId.error.message, { status: 500 })

    const path = `calls/${callId.data}/recording.mp3`
    const { error: uploadError } = await sb.storage
      .from('comms')
      .upload(path, bytes, { contentType: 'audio/mpeg', upsert: true })
    if (uploadError) return new Response(uploadError.message, { status: 500 })

    const { error: updateError } = await sb.rpc('record_call', {
      p_provider_call_sid: callSid,
      p_direction: 'outbound',
      p_from_number: env.businessNumber,
      p_to_number: params.To ?? '',
      p_contact_id: contactId,
      p_recording_path: path,
    })
    if (updateError) return new Response(updateError.message, { status: 500 })

    // …then delete the Twilio-hosted copy.
    await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${env.accountSid}/Recordings/${recordingSid}.json`,
      {
        method: 'DELETE',
        headers: { Authorization: `Basic ${btoa(`${env.accountSid}:${env.authToken}`)}` },
      },
    )
    return new Response('ok', { status: 200 })
  }

  // Completion callback.
  const outcome =
    params.CallStatus === 'completed'
      ? 'connected'
      : params.CallStatus === 'busy'
        ? 'busy'
        : params.CallStatus === 'no-answer'
          ? 'no_answer'
          : params.CallStatus === 'failed'
            ? 'failed'
            : null

  const { error } = await sb.rpc('record_call', {
    p_provider_call_sid: params.CallSid,
    p_direction: 'outbound',
    p_from_number: env.businessNumber,
    p_to_number: url.searchParams.get('to') ?? params.To ?? '',
    p_contact_id: contactId,
    p_job_id: jobId,
    p_outcome: outcome,
    p_ended_at: new Date().toISOString(),
    p_duration_seconds: params.CallDuration ? Number(params.CallDuration) : null,
  })
  if (error) return new Response(error.message, { status: 500 })
  return new Response('ok', { status: 200 })
})
