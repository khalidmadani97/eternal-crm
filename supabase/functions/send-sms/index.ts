// Outbound SMS (Slice 10). Fails CLOSED on consent: no valid unexpired
// grant for the destination number, no send — checked here before Twilio is
// ever called, and enforced again by the DB trigger on messages.

import {
  CORS_HEADERS,
  hasSmsConsent,
  json,
  latestOpenJob,
  publicFunctionUrl,
  requireStaff,
  serviceClient,
  twilioEnv,
} from '../_shared/twilio.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const auth = await requireStaff(req)
  if (auth instanceof Response) return auth

  let contactId: unknown, jobId: unknown, body: unknown
  try {
    ;({ contactId, jobId, body } = await req.json())
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  if (typeof contactId !== 'string' || typeof body !== 'string' || !body.trim()) {
    return json({ error: 'contactId and body are required' }, 400)
  }

  const sb = serviceClient()
  const { data: contact, error: contactError } = await sb
    .from('contacts')
    .select('id, phone')
    .eq('id', contactId)
    .maybeSingle()
  if (contactError) return json({ error: contactError.message }, 500)
  if (!contact?.phone) return json({ error: 'Contact has no phone number' }, 400)

  // Consent gate FIRST — before any Twilio call.
  if (!(await hasSmsConsent(sb, contact.phone))) {
    return json(
      {
        error:
          'No SMS consent on file for this number (or consent was withdrawn/expired). ' +
          'CASL: get an inbound text or record express consent first.',
      },
      403,
    )
  }

  const env = twilioEnv()
  if (!env) return json({ error: 'Twilio is not configured — set the TWILIO_* function secrets' }, 503)

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${env.accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${env.accountSid}:${env.authToken}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: contact.phone,
        From: env.businessNumber,
        Body: body.trim(),
        StatusCallback: publicFunctionUrl('sms-status'),
      }),
    },
  )
  const message = await res.json()
  if (!res.ok) return json({ error: `Twilio: ${message?.message ?? res.status}` }, 502)

  const resolvedJobId =
    typeof jobId === 'string' ? jobId : await latestOpenJob(sb, contact.id)

  const { error: recordError } = await sb.rpc('record_message', {
    p_provider_message_sid: message.sid,
    p_direction: 'outbound',
    p_from_number: env.businessNumber,
    p_to_number: contact.phone,
    p_contact_id: contact.id,
    p_status: 'queued',
    p_job_id: resolvedJobId,
    p_body: body.trim(),
    p_sent_at: new Date().toISOString(),
  })
  if (recordError) return json({ error: recordError.message }, 500)

  return json({ ok: true, sid: message.sid })
})
