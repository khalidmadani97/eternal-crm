// Meta Business Suite webhook (Slice 19, DECISIONS 025): Facebook Page
// Messenger + Instagram DMs land on the contact card.
// Also handles leadgen events (Meta Lead Ads): when someone fills a Lead Ad
// form, Meta sends a 'leadgen' change event. We fetch the lead details from
// Graph API using the business's Page Access Token (needs leads_retrieval
// permission — Meta App Review required) and create an inbound_lead + contact
// + job with full attribution metadata (ad_id, campaign_id, adset_id, form_id).
//   GET  — Meta's subscription handshake (hub.verify_token → hub.challenge)
//   POST — message events + leadgen events, X-Hub-Signature-256 validated

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

// ── Lead Gen: fetch lead details + create lead/contact/job ───────────────────

function normalizePhone(input: string): string | null {
  const digits = input.trim().replace(/[^\d+]/g, '')
  if (/^\+[1-9]\d{7,14}$/.test(digits)) return digits
  const bare = digits.replace(/\D/g, '')
  if (bare.length === 10) return `+1${bare}`
  if (bare.length === 11 && bare.startsWith('1')) return `+${bare}`
  return null
}

interface LeadgenValue {
  leadgen_id?: string
  page_id?: string
  form_id?: string
  ad_id?: string
  adgroup_id?: string
  campaign_id?: string
}

async function processLeadgenEvent(
  sb: ReturnType<typeof service>,
  value: LeadgenValue,
) {
  const { leadgen_id, page_id, form_id, ad_id, adgroup_id, campaign_id } = value
  if (!leadgen_id || !page_id) return

  // Find the business configured for this page
  const { data: bizSettings } = await sb
    .from('business_settings')
    .select('business_id, meta_page_access_token')
    .eq('meta_page_id', page_id)
    .maybeSingle()
  if (!bizSettings?.meta_page_access_token) return // page not configured or no token

  const { business_id, meta_page_access_token } = bizSettings

  // Fetch lead details from Meta Graph API
  const fields = 'field_data,created_time,ad_id,adgroup_id,campaign_id,form_id'
  const leadRes = await fetch(
    `https://graph.facebook.com/v21.0/${leadgen_id}?fields=${fields}&access_token=${meta_page_access_token}`,
  )
  if (!leadRes.ok) return
  const leadData = await leadRes.json()

  // Extract field_data: [{name: 'full_name', values: ['Jane Doe']}, ...]
  const fields_map: Record<string, string> = {}
  for (const f of (leadData.field_data ?? []) as { name: string; values: string[] }[]) {
    fields_map[f.name.toLowerCase()] = (f.values ?? [])[0] ?? ''
  }

  const rawName =
    fields_map['full_name'] ||
    `${fields_map['first_name'] ?? ''} ${fields_map['last_name'] ?? ''}`.trim() ||
    null
  const rawPhone = fields_map['phone_number'] || fields_map['phone'] || null
  const rawEmail = fields_map['email'] || null

  // Idempotent: don't create duplicate if we've already seen this lead
  const { data: existing } = await sb
    .from('inbound_leads')
    .select('id')
    .eq('business_id', business_id)
    .eq('platform_lead_id', leadgen_id)
    .maybeSingle()
  if (existing) return

  const raw_payload = { ...fields_map, leadgen_id, page_id, form_id, ad_id, adgroup_id, campaign_id }

  const { data: lead, error: leadError } = await sb
    .from('inbound_leads')
    .insert({
      business_id,
      provider: 'meta_lead_form',
      raw_payload,
      dedupe_key: `meta:${leadgen_id}`,
      parsed_name: rawName,
      parsed_phone: rawPhone,
      parsed_email: rawEmail,
      platform_lead_id: leadgen_id,
      ad_id: ad_id ?? leadData.ad_id ?? null,
      campaign_id: campaign_id ?? leadData.campaign_id ?? null,
      adset_id: adgroup_id ?? leadData.adgroup_id ?? null,
      form_id: form_id ?? leadData.form_id ?? null,
    })
    .select('id')
    .single()
  if (leadError) return

  const phone = rawPhone ? normalizePhone(rawPhone) : null
  let contactId: string | null = null
  if (phone) {
    const { data } = await sb.from('contacts').select('id')
      .eq('business_id', business_id).eq('phone', phone).is('deleted_at', null).limit(1).maybeSingle()
    contactId = data?.id ?? null
  }
  if (!contactId && rawEmail) {
    const { data } = await sb.from('contacts').select('id')
      .eq('business_id', business_id).ilike('email', rawEmail).is('deleted_at', null).limit(1).maybeSingle()
    contactId = data?.id ?? null
  }
  if (!contactId) {
    const { data: contact } = await sb.from('contacts').insert({
      business_id,
      full_name: rawName || rawEmail || phone || 'Meta lead',
      phone,
      email: rawEmail || null,
      lead_source: 'meta_lead_form',
    }).select('id').single()
    if (!contact) return
    contactId = contact.id
  }

  const { data: jobNumber } = await sb.rpc('next_document_number_for', {
    p_business: business_id,
    p_prefix: 'EI',
  })
  const { data: job } = await sb.from('jobs').insert({
    business_id,
    contact_id: contactId,
    job_number: jobNumber,
    title: rawName || rawEmail || 'Meta Lead Ad',
    stage: 'new',
    lead_source: 'meta_lead_form',
  }).select('id').single()
  if (!job) return

  // Note with remaining form fields
  const extraFields = Object.entries(fields_map)
    .filter(([k]) => !['full_name', 'first_name', 'last_name', 'email', 'phone_number', 'phone'].includes(k))
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n')
  if (extraFields) {
    await sb.from('activities').insert({
      business_id,
      job_id: job.id,
      contact_id: contactId,
      kind: 'note',
      body: `Meta Lead Ad form data:\n${extraFields.slice(0, 1500)}`,
    })
  }

  await sb.from('inbound_leads')
    .update({ contact_id: contactId, job_id: job.id, converted_at: new Date().toISOString() })
    .eq('id', lead.id)

  // Best-effort push notification to staff
  try {
    await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-push`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: 'New Meta Lead',
        body: `${rawName ?? rawEmail ?? 'New lead'} via Meta Lead Ads`,
        url: `/jobs/${job.id}`,
      }),
    })
  } catch { /* best-effort */ }
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

  let body: {
    object?: string
    entry?: {
      messaging?: MessagingEvent[]
      changes?: { field: string; value: LeadgenValue }[]
    }[]
  }
  try {
    body = JSON.parse(payload)
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const platform = body.object === 'instagram' ? 'instagram' : 'messenger'
  const sb = service()
  const pageToken = Deno.env.get('META_PAGE_TOKEN')

  for (const entry of body.entry ?? []) {
    // ── Leadgen events ─────────────────────────────────────────────────────
    for (const change of entry.changes ?? []) {
      if (change.field === 'leadgen') {
        await processLeadgenEvent(sb, change.value)
      }
    }

    // ── Messaging events (DMs) ─────────────────────────────────────────────
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
