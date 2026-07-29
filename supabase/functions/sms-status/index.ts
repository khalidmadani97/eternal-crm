// Delivery status webhook (Slice 10). Signature-validated; updates the
// existing message row in place via record_message()'s progression branch.

import {
  publicFunctionUrl,
  serviceClient,
  twilioEnv,
  validateTwilioSignature,
} from '../_shared/twilio.ts'

const STATUS_MAP: Record<string, string> = {
  queued: 'queued',
  accepted: 'queued',
  sending: 'queued',
  sent: 'sent',
  delivered: 'delivered',
  failed: 'failed',
  undelivered: 'failed',
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const env = twilioEnv()
  if (!env) return new Response('Not configured', { status: 503 })

  const url = new URL(req.url)
  const params = Object.fromEntries((await req.formData()).entries()) as Record<string, string>
  const valid = await validateTwilioSignature(
    publicFunctionUrl('sms-status', url.search),
    params,
    req.headers.get('X-Twilio-Signature'),
    env.authToken,
  )
  if (!valid) return new Response('Invalid signature', { status: 403 })

  const sid = params.MessageSid
  const status = STATUS_MAP[params.MessageStatus ?? '']
  if (!sid || !status) return new Response('ok', { status: 200 })

  const sb = serviceClient()
  const { data: message, error: findError } = await sb
    .from('messages')
    .select('contact_id, direction, from_number, to_number')
    .eq('provider_message_sid', sid)
    .maybeSingle()
  if (findError) return new Response(findError.message, { status: 500 })
  if (!message) return new Response('ok', { status: 200 }) // unknown SID — nothing to update

  const { error } = await sb.rpc('record_message', {
    p_provider_message_sid: sid,
    p_direction: message.direction,
    p_from_number: message.from_number,
    p_to_number: message.to_number,
    p_contact_id: message.contact_id,
    p_status: status,
    p_delivered_at: status === 'delivered' ? new Date().toISOString() : null,
    p_error_code: params.ErrorCode ?? null,
  })
  if (error) return new Response(error.message, { status: 500 })
  return new Response('ok', { status: 200 })
})
