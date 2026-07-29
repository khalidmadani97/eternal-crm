// Inbound SMS webhook (Slice 10). Signature-validated (403 otherwise),
// idempotent on MessageSid via record_message(). Matches or creates the
// contact by exact E.164. An inbound message creates an implied CASL grant
// with the message itself as evidence; STOP words write a withdrawn record
// instead — the DB trigger then blocks all future outbound sends.

import {
  latestOpenJob,
  matchOrCreateContact,
  publicFunctionUrl,
  serviceClient,
  twilioEnv,
  twiml,
  validateTwilioSignature,
} from '../_shared/twilio.ts'

const STOP_WORDS = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'])
// CASL implied consent from an inquiry expires after 6 months.
const IMPLIED_CONSENT_MONTHS = 6

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const env = twilioEnv()
  if (!env) return new Response('Not configured', { status: 503 })

  const url = new URL(req.url)
  const params = Object.fromEntries((await req.formData()).entries()) as Record<string, string>
  const valid = await validateTwilioSignature(
    publicFunctionUrl('sms-inbound', url.search),
    params,
    req.headers.get('X-Twilio-Signature'),
    env.authToken,
  )
  if (!valid) return new Response('Invalid signature', { status: 403 })

  const from = params.From
  const body = params.Body ?? ''
  const sid = params.MessageSid
  if (!from || !sid) return new Response('Missing parameters', { status: 400 })

  const sb = serviceClient()

  // Whole-webhook idempotency: a replayed delivery changes nothing — not
  // even a duplicate consent row.
  const { data: existing } = await sb
    .from('messages')
    .select('id')
    .eq('provider_message_sid', sid)
    .maybeSingle()
  if (existing) return twiml('')

  const contact = await matchOrCreateContact(sb, from)

  const isStop = STOP_WORDS.has(body.trim().toUpperCase())
  if (isStop) {
    await sb.from('consent_records').insert({
      contact_id: contact.id,
      phone_number: from,
      channel: 'sms',
      status: 'withdrawn',
      source: 'inbound_sms',
      evidence: { message_sid: sid, body },
      withdrawn_at: new Date().toISOString(),
    })
  } else {
    const expires = new Date()
    expires.setMonth(expires.getMonth() + IMPLIED_CONSENT_MONTHS)
    await sb.from('consent_records').insert({
      contact_id: contact.id,
      phone_number: from,
      channel: 'sms',
      status: 'implied',
      source: 'inbound_sms',
      evidence: { message_sid: sid, body },
      granted_at: new Date().toISOString(),
      expires_at: expires.toISOString(),
    })
  }

  // Inbound MMS media is copied into the private comms bucket.
  const mediaPaths: string[] = []
  const numMedia = Number(params.NumMedia ?? '0')
  for (let i = 0; i < numMedia; i++) {
    const mediaUrl = params[`MediaUrl${i}`]
    if (!mediaUrl) continue
    const media = await fetch(mediaUrl, {
      headers: { Authorization: `Basic ${btoa(`${env.accountSid}:${env.authToken}`)}` },
    })
    if (!media.ok) continue
    const contentType = media.headers.get('Content-Type') ?? 'application/octet-stream'
    const ext = contentType.split('/')[1]?.split(';')[0] ?? 'bin'
    const path = `messages/${sid}/media-${i}.${ext}`
    const { error } = await sb.storage
      .from('comms')
      .upload(path, new Uint8Array(await media.arrayBuffer()), { contentType, upsert: true })
    if (!error) mediaPaths.push(path)
  }

  const jobId = await latestOpenJob(sb, contact.id)
  const { error: recordError } = await sb.rpc('record_message', {
    p_provider_message_sid: sid,
    p_direction: 'inbound',
    p_from_number: from,
    p_to_number: params.To ?? env.businessNumber,
    p_contact_id: contact.id,
    p_status: 'received',
    p_job_id: jobId,
    p_body: body,
    p_media_paths: mediaPaths.length ? mediaPaths : null,
  })
  if (recordError) return new Response(recordError.message, { status: 500 })

  return twiml('') // no auto-reply
})
