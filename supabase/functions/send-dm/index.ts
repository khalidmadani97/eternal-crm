// Outbound Messenger/Instagram reply (Slice 19). Staff-only. Sends through
// the Graph API with the page token and records via record_dm(). Meta's
// 24-hour messaging window applies — outside it the API rejects the send and
// the error is surfaced to the UI.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { json, requireStaff } from '../_shared/twilio.ts'

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const auth = await requireStaff(req)
  if (auth instanceof Response) return auth

  const pageToken = Deno.env.get('META_PAGE_TOKEN')
  if (!pageToken) {
    return json({ error: 'Meta is not configured — set META_PAGE_TOKEN in function secrets' }, 503)
  }

  let contactId: unknown, jobId: unknown, body: unknown
  try {
    ;({ contactId, jobId, body } = await req.json())
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  if (typeof contactId !== 'string' || typeof body !== 'string' || !body.trim()) {
    return json({ error: 'contactId and body are required' }, 400)
  }

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
  const { data: identity, error: identityError } = await sb
    .from('channel_identities')
    .select('platform, external_id')
    .eq('contact_id', contactId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (identityError) return json({ error: identityError.message }, 500)
  if (!identity) return json({ error: 'Contact has no linked Messenger/Instagram identity' }, 400)

  const res = await fetch(`https://graph.facebook.com/v19.0/me/messages?access_token=${pageToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: identity.external_id },
      messaging_type: 'RESPONSE',
      message: { text: body.trim() },
    }),
  })
  const result = await res.json()
  if (!res.ok) {
    const msg = result?.error?.message ?? `Graph API ${res.status}`
    const windowHint = msg.includes('window')
      ? ' (Meta only allows replies within 24h of their last message — answer from Business Suite instead)'
      : ''
    return json({ error: `Meta: ${msg}${windowHint}` }, 502)
  }

  const { error: recordError } = await sb.rpc('record_dm', {
    p_provider_message_id: result.message_id ?? `out-${crypto.randomUUID()}`,
    p_platform: identity.platform,
    p_external_id: identity.external_id,
    p_direction: 'outbound',
    p_contact_id: contactId,
    p_job_id: typeof jobId === 'string' ? jobId : null,
    p_body: body.trim(),
  })
  if (recordError) return json({ error: recordError.message }, 500)

  return json({ ok: true })
})
