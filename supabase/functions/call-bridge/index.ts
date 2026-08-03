// Dial-out bridging (Slice 10, DECISIONS 012): staff clicks Call → Twilio
// rings the staff cell → answering dials the client, who sees the business
// number and hears the recorded-call announcement before connecting.

import { CORS_HEADERS, json, publicFunctionUrl, requireStaff, serviceClient, twilioEnv } from '../_shared/twilio.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const auth = await requireStaff(req)
  if (auth instanceof Response) return auth

  const env = twilioEnv()
  if (!env) return json({ error: 'Twilio is not configured — set the TWILIO_* function secrets' }, 503)

  let contactId: unknown, jobId: unknown
  try {
    ;({ contactId, jobId } = await req.json())
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  if (typeof contactId !== 'string') return json({ error: 'contactId is required' }, 400)

  const sb = serviceClient()
  const { data: contact, error: contactError } = await sb
    .from('contacts')
    .select('id, phone, full_name')
    .eq('id', contactId)
    .maybeSingle()
  if (contactError) return json({ error: contactError.message }, 500)
  if (!contact?.phone) return json({ error: 'Contact has no phone number' }, 400)

  const query =
    `?to=${encodeURIComponent(contact.phone)}` +
    `&contactId=${contact.id}` +
    (typeof jobId === 'string' ? `&jobId=${jobId}` : '')

  const body = new URLSearchParams({
    To: env.staffNumber,
    From: env.businessNumber,
    Url: publicFunctionUrl('call-twiml', query),
    StatusCallback: publicFunctionUrl('call-status', query),
    StatusCallbackEvent: 'completed',
  })
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${env.accountSid}/Calls.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${env.accountSid}:${env.authToken}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    },
  )
  const call = await res.json()
  if (!res.ok) return json({ error: `Twilio: ${call?.message ?? res.status}` }, 502)

  // The call lands on the timeline immediately; the completion webhook
  // fills in outcome, duration, and the recording via the same SID.
  const { error: recordError } = await sb.rpc('record_call', {
    p_provider_call_sid: call.sid,
    p_direction: 'outbound',
    p_from_number: env.businessNumber,
    p_to_number: contact.phone,
    p_contact_id: contact.id,
    p_job_id: typeof jobId === 'string' ? jobId : null,
    p_started_at: new Date().toISOString(),
    p_body: `Outbound call to ${contact.full_name}`,
  })
  if (recordError) return json({ error: recordError.message }, 500)

  return json({ ok: true, sid: call.sid })
})
