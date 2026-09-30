// Google Lead Form Extensions webhook (DECISIONS 025 / Slice 19).
// Google POSTs a JSON body to this URL when someone submits a Lead Form Ad.
// Verification: the body includes `google_key` which must match the shared
// secret stored in business_settings.google_lead_webhook_key for the right
// business.  We use a query-param `?b=<business_id>` so we can look up the
// right key without scanning all businesses.
//
// Compliance notes:
//   - Two-way sync: conversion events are sent back via process-conversions
//     (gclid-based uploadClickConversions) — see that function.
//   - Google requires the endpoint to respond 200 within 5 seconds.
//   - Lead data format: https://support.google.com/google-ads/answer/9423886

import { createClient } from 'npm:@supabase/supabase-js@2'

function service() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
}

function normalizePhone(input: string): string | null {
  const digits = input.trim().replace(/[^\d+]/g, '')
  if (/^\+[1-9]\d{7,14}$/.test(digits)) return digits
  const bare = digits.replace(/\D/g, '')
  if (bare.length === 10) return `+1${bare}`
  if (bare.length === 11 && bare.startsWith('1')) return `+${bare}`
  return null
}

interface GoogleLeadPayload {
  google_key?: string
  lead_id?: string
  user_column_data?: { column_name: string; string_value?: string; column_id?: string }[]
  // Attribution
  campaign_id?: string
  campaign_name?: string
  adgroup_id?: string
  adgroup_name?: string
  creative_id?: string
  // Google Click ID — present when Enhanced Conversions is active
  gcl_id?: string
  api_version?: string
  form_id?: string
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  // ?b= identifies the business so we can verify the right google_key
  const url = new URL(req.url)
  const businessId = url.searchParams.get('b')
  if (!businessId) return new Response('Missing business id', { status: 400 })

  let body: GoogleLeadPayload
  try {
    body = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const sb = service()

  // Verify shared secret matches the one stored for this business
  const { data: bizSettings } = await sb
    .from('business_settings')
    .select('google_lead_webhook_key')
    .eq('business_id', businessId)
    .maybeSingle()

  if (!bizSettings?.google_lead_webhook_key) {
    return new Response('Not configured', { status: 503 })
  }
  if (body.google_key !== bizSettings.google_lead_webhook_key) {
    return new Response('Invalid key', { status: 403 })
  }

  const leadId = body.lead_id ?? null

  // Idempotent: skip if already processed
  if (leadId) {
    const { data: existing } = await sb
      .from('inbound_leads')
      .select('id')
      .eq('business_id', businessId)
      .eq('platform_lead_id', leadId)
      .maybeSingle()
    if (existing) return new Response('OK', { status: 200 })
  }

  // Parse user_column_data
  const fields: Record<string, string> = {}
  for (const col of body.user_column_data ?? []) {
    if (col.column_name && col.string_value) {
      fields[col.column_name.toLowerCase()] = col.string_value
    }
  }

  const rawName =
    fields['full_name'] ||
    `${fields['first_name'] ?? ''} ${fields['last_name'] ?? ''}`.trim() ||
    null
  const rawPhone = fields['phone_number'] || fields['phone'] || null
  const rawEmail = fields['email'] || null

  const raw_payload = { ...fields, ...body }

  const { data: lead, error: leadError } = await sb
    .from('inbound_leads')
    .insert({
      business_id: businessId,
      provider: 'google_lead_form',
      raw_payload,
      dedupe_key: leadId ? `google:${leadId}` : null,
      parsed_name: rawName,
      parsed_phone: rawPhone,
      parsed_email: rawEmail,
      platform_lead_id: leadId,
      ad_id: body.creative_id ?? null,
      campaign_id: body.campaign_id ?? null,
      adset_id: body.adgroup_id ?? null,
      form_id: body.form_id ?? null,
      // Store gclid in raw_payload — process-conversions will pick it up
    })
    .select('id')
    .single()
  if (leadError) return new Response(leadError.message, { status: 500 })

  // Find or create contact
  const phone = rawPhone ? normalizePhone(rawPhone) : null
  let contactId: string | null = null
  if (phone) {
    const { data } = await sb.from('contacts').select('id')
      .eq('business_id', businessId).eq('phone', phone).is('deleted_at', null).limit(1).maybeSingle()
    contactId = data?.id ?? null
  }
  if (!contactId && rawEmail) {
    const { data } = await sb.from('contacts').select('id')
      .eq('business_id', businessId).ilike('email', rawEmail).is('deleted_at', null).limit(1).maybeSingle()
    contactId = data?.id ?? null
  }
  if (!contactId) {
    const { data: contact } = await sb.from('contacts').insert({
      business_id: businessId,
      full_name: rawName || rawEmail || phone || 'Google lead',
      phone,
      email: rawEmail || null,
      lead_source: 'google_lead_form',
    }).select('id').single()
    if (!contact) return new Response('Failed to create contact', { status: 500 })
    contactId = contact.id
  }

  const { data: jobNumber } = await sb.rpc('next_document_number_for', {
    p_business: businessId,
    p_prefix: 'EI',
  })
  const { data: job } = await sb.from('jobs').insert({
    business_id: businessId,
    contact_id: contactId,
    job_number: jobNumber,
    title: rawName || rawEmail || (body.campaign_name ? `${body.campaign_name} lead` : 'Google Lead'),
    stage: 'new',
    lead_source: 'google_lead_form',
  }).select('id').single()
  if (!job) return new Response('Failed to create job', { status: 500 })

  // Activity note with extra form fields + attribution
  const extraFields = Object.entries(fields)
    .filter(([k]) => !['full_name', 'first_name', 'last_name', 'email', 'phone_number', 'phone'].includes(k))
    .map(([k, v]) => `${k}: ${v}`)
  const attrLines = [
    body.campaign_name ? `Campaign: ${body.campaign_name}` : null,
    body.adgroup_name ? `Ad group: ${body.adgroup_name}` : null,
    body.gcl_id ? `gclid: ${body.gcl_id}` : null,
  ].filter(Boolean)
  const noteLines = [...extraFields, ...attrLines]
  if (noteLines.length) {
    await sb.from('activities').insert({
      business_id: businessId,
      job_id: job.id,
      contact_id: contactId,
      kind: 'note',
      body: `Google Lead Form data:\n${noteLines.slice(0, 30).join('\n').slice(0, 1500)}`,
    })
  }

  await sb.from('inbound_leads')
    .update({ contact_id: contactId, job_id: job.id, converted_at: new Date().toISOString() })
    .eq('id', lead.id)

  // Send gclid click conversion back to Google Ads (two-way sync / lead quality signal)
  if (body.gcl_id) {
    try {
      const { data: gads } = await sb
        .from('business_settings')
        .select(`
          google_ads_customer_id, google_ads_developer_token,
          google_ads_refresh_token, google_ads_oauth_client_id,
          google_ads_oauth_client_secret, google_ads_conversion_action
        `)
        .eq('business_id', businessId)
        .single()

      const googleConfigured = !!(
        gads?.google_ads_customer_id && gads?.google_ads_developer_token &&
        gads?.google_ads_refresh_token && gads?.google_ads_oauth_client_id &&
        gads?.google_ads_oauth_client_secret && gads?.google_ads_conversion_action
      )

      if (googleConfigured) {
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: gads!.google_ads_oauth_client_id!,
            client_secret: gads!.google_ads_oauth_client_secret!,
            refresh_token: gads!.google_ads_refresh_token!,
            grant_type: 'refresh_token',
          }),
        })
        if (tokenRes.ok) {
          const { access_token } = await tokenRes.json()
          const customerId = gads!.google_ads_customer_id!.replace(/\D/g, '')
          const conversionDateTime = new Date().toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '+00:00')
          await fetch(
            `https://googleads.googleapis.com/v18/customers/${customerId}:uploadClickConversions`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${access_token}`,
                'developer-token': gads!.google_ads_developer_token!,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                conversions: [{
                  conversionAction: `customers/${customerId}/conversionActions/${gads!.google_ads_conversion_action}`,
                  conversionDateTime,
                  gclid: body.gcl_id,
                }],
                partialFailure: true,
              }),
            },
          )
        }
      }
    } catch { /* best-effort — lead is already saved */ }
  }

  // Best-effort push notification to staff
  try {
    await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-push`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: 'New Google Lead',
        body: `${rawName ?? rawEmail ?? 'New lead'} via Google Lead Ads`,
        url: `/jobs/${job.id}`,
      }),
    })
  } catch { /* best-effort */ }

  return new Response('OK', { status: 200 })
})
