// Meta Business Suite webhook (Slice 19, DECISIONS 025): Facebook Page
// Messenger + Instagram DMs land on the contact card.
//   GET  — Meta's subscription handshake (hub.verify_token → hub.challenge)
//   POST — message events, X-Hub-Signature-256 validated (403 otherwise),
//          idempotent on the message id via record_dm().
// Unknown senders become unverified contacts with a channel identity; staff
// can re-link the identity to the right contact later.

import { createClient } from 'npm:@supabase/supabase-js@2'

const encoder = new TextEncoder()

function service() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
}

async function validSignature(payload: string, header: string | null, secret: string) {
  if (!header?.startsWith('sha256=')) return false
  const signature = header.slice(7)
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
  const expected = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  if (expected.length !== signature.length) return false
  let mismatch = 0
  for (let i = 0; i < expected.length; i++) mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i)
  return mismatch === 0
}

interface MessagingEvent {
  sender?: { id: string }
  recipient?: { id: string }
  timestamp?: number
  message?: { mid: string; text?: string; is_echo?: boolean }
}

Deno.serve(async (req) => {
  const url = new URL(req.url)

  if (req.method === 'GET') {
    const verifyToken = Deno.env.get('META_VERIFY_TOKEN')
    if (!verifyToken) return new Response('Not configured', { status: 503 })
    if (
      url.searchParams.get('hub.mode') === 'subscribe' &&
      url.searchParams.get('hub.verify_token') === verifyToken
    ) {
      return new Response(url.searchParams.get('hub.challenge') ?? '', { status: 200 })
    }
    return new Response('Verification failed', { status: 403 })
  }

  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const appSecret = Deno.env.get('META_APP_SECRET')
  if (!appSecret) return new Response('Not configured', { status: 503 })

  const payload = await req.text()
  if (!(await validSignature(payload, req.headers.get('X-Hub-Signature-256'), appSecret))) {
    return new Response('Invalid signature', { status: 403 })
  }

  let body: { object?: string; entry?: { messaging?: MessagingEvent[] }[] }
  try {
    body = JSON.parse(payload)
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const platform = body.object === 'instagram' ? 'instagram' : 'messenger'
  const sb = service()
  const pageToken = Deno.env.get('META_PAGE_TOKEN')

  for (const entry of body.entry ?? []) {
    for (const event of entry.messaging ?? []) {
      const message = event.message
      const psid = event.sender?.id
      if (!message?.mid || !psid) continue
      if (message.is_echo) continue // our own outbound, already recorded by send-dm

      // Identity → contact (or create an unverified one).
      let contactId: string
      const { data: identity, error: identityError } = await sb
        .from('channel_identities')
        .select('contact_id')
        .eq('platform', platform)
        .eq('external_id', psid)
        .maybeSingle()
      if (identityError) return new Response(identityError.message, { status: 500 })
      if (identity) {
        contactId = identity.contact_id
      } else {
        // Best-effort profile name from the Graph API.
        let displayName = `${platform === 'instagram' ? 'Instagram' : 'Messenger'} user ${psid.slice(-4)}`
        if (pageToken) {
          try {
            const profile = await fetch(
              `https://graph.facebook.com/v19.0/${psid}?fields=name&access_token=${pageToken}`,
            )
            const profileData = await profile.json()
            if (profile.ok && profileData.name) displayName = profileData.name
          } catch {
            /* keep placeholder */
          }
        }
        const { data: contact, error: contactError } = await sb
          .from('contacts')
          .insert({ full_name: displayName, auto_created: true, lead_source: platform })
          .select('id')
          .single()
        if (contactError) return new Response(contactError.message, { status: 500 })
        contactId = contact.id
        const { error: linkError } = await sb.from('channel_identities').insert({
          contact_id: contactId,
          platform,
          external_id: psid,
          display_name: displayName,
        })
        if (linkError && !linkError.message.includes('duplicate')) {
          return new Response(linkError.message, { status: 500 })
        }
      }

      const { data: job } = await sb
        .from('jobs')
        .select('id')
        .eq('contact_id', contactId)
        .is('deleted_at', null)
        .not('stage', 'in', '(closed,lost)')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      const { error: recordError } = await sb.rpc('record_dm', {
        p_provider_message_id: message.mid,
        p_platform: platform,
        p_external_id: psid,
        p_direction: 'inbound',
        p_contact_id: contactId,
        p_job_id: job?.id ?? null,
        p_body: message.text ?? '(attachment)',
      })
      if (recordError) return new Response(recordError.message, { status: 500 })

      // Best-effort push to staff.
      try {
        await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-push`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            title: `${platform === 'instagram' ? 'Instagram' : 'Messenger'} message`,
            body: (message.text ?? '(attachment)').slice(0, 120),
            url: '/inbox',
          }),
        })
      } catch {
        /* best-effort */
      }
    }
  }

  // Always 200 once processed — Meta retries aggressively otherwise.
  return new Response('EVENT_RECEIVED', { status: 200 })
})
