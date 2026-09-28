// Ad conversion tracking (Slice 52).
// Sends server-side conversion events to Meta Conversions API and Google Ads
// when a lead becomes a won job. Called by the React app after a stage→won
// change; also callable manually from Settings to retry failed events.
//
// POST { businessId? }
// Returns { processed: number, meta: { sent, skipped, error }, google: { sent, skipped, error } }

import { createClient } from 'npm:@supabase/supabase-js@2'
import { CORS_HEADERS, json, requireStaff } from '../_shared/twilio.ts'

function service() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
}

// ── Hashing (Meta + Google both require SHA-256 of normalised PII) ────────────

const encoder = new TextEncoder()

async function sha256hex(value: string): Promise<string> {
  const data = encoder.encode(value.trim().toLowerCase())
  const buf = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// E.164 → digits only (Meta requires digits-only phone, no +)
function phoneDigits(e164: string): string {
  return e164.replace(/\D/g, '')
}

// ── Meta Conversions API ──────────────────────────────────────────────────────

interface MetaSettings {
  pixelId: string
  capiToken: string
}

interface ConversionData {
  email: string | null
  phone: string | null
  wonAt: string
  value: number | null
  jobId: string
}

async function sendMetaCapi(
  settings: MetaSettings,
  conv: ConversionData,
): Promise<{ ok: boolean; error?: string }> {
  const userData: Record<string, string[]> = {}
  if (conv.email) userData.em = [await sha256hex(conv.email)]
  if (conv.phone) userData.ph = [await sha256hex(phoneDigits(conv.phone))]

  if (!userData.em && !userData.ph) {
    return { ok: false, error: 'No email or phone to hash for matching' }
  }

  const eventTime = Math.floor(new Date(conv.wonAt).getTime() / 1000)
  const payload = {
    data: [
      {
        event_name: 'Purchase',
        event_time: eventTime,
        event_id: `crm-won-${conv.jobId}`,  // dedup key — idempotent on re-send
        action_source: 'crm',
        user_data: userData,
        ...(conv.value != null && conv.value > 0
          ? { custom_data: { currency: 'CAD', value: conv.value } }
          : {}),
      },
    ],
  }

  const res = await fetch(
    `https://graph.facebook.com/v21.0/${settings.pixelId}/events?access_token=${settings.capiToken}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  )
  const body = await res.json()
  if (!res.ok) {
    return { ok: false, error: body?.error?.message ?? `HTTP ${res.status}` }
  }
  return { ok: true }
}

// ── Google Ads enhanced conversions ──────────────────────────────────────────

interface GoogleSettings {
  customerId: string          // e.g. "1234567890" (digits only, no dashes)
  developerToken: string
  oauthClientId: string
  oauthClientSecret: string
  refreshToken: string
  conversionActionId: string  // numeric ID of the conversion action
}

async function getGoogleAccessToken(settings: GoogleSettings): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: settings.oauthClientId,
      client_secret: settings.oauthClientSecret,
      refresh_token: settings.refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`OAuth token refresh failed: ${body}`)
  }
  const data = await res.json()
  return data.access_token as string
}

async function sendGoogleConversion(
  settings: GoogleSettings,
  conv: ConversionData,
): Promise<{ ok: boolean; error?: string }> {
  if (!conv.email && !conv.phone) {
    return { ok: false, error: 'No email or phone to hash for matching' }
  }

  let accessToken: string
  try {
    accessToken = await getGoogleAccessToken(settings)
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }

  const customerId = settings.customerId.replace(/\D/g, '')
  const conversionDateTime = new Date(conv.wonAt)
    .toISOString()
    .replace('T', ' ')
    .replace(/\.\d{3}Z$/, '+00:00')

  const userIdentifiers = []
  if (conv.email) {
    userIdentifiers.push({ hashedEmail: await sha256hex(conv.email) })
  }
  if (conv.phone) {
    // Google requires E.164 format, hashed
    userIdentifiers.push({ hashedPhoneNumber: await sha256hex(conv.phone) })
  }

  const body = {
    conversions: [
      {
        conversionAction: `customers/${customerId}/conversionActions/${settings.conversionActionId}`,
        conversionDateTime,
        ...(conv.value != null && conv.value > 0
          ? { conversionValue: conv.value, currencyCode: 'CAD' }
          : {}),
        userIdentifiers,
      },
    ],
    partialFailure: true,
  }

  const res = await fetch(
    `https://googleads.googleapis.com/v18/customers/${customerId}:uploadClickConversions`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'developer-token': settings.developerToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  )
  const data = await res.json()
  if (!res.ok) {
    return { ok: false, error: data?.error?.message ?? `HTTP ${res.status}` }
  }
  // Partial failures are returned in partialFailureError
  if (data.partialFailureError) {
    return { ok: false, error: data.partialFailureError.message ?? 'Partial failure' }
  }
  return { ok: true }
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const auth = await requireStaff(req)
  if (auth instanceof Response) return auth

  const body = await req.json().catch(() => ({}))
  const sb = service()

  // Resolve business
  const { data: profile } = await sb
    .from('profiles')
    .select('active_business_id, platform_admin')
    .eq('id', auth.userId)
    .single()

  const businessId: string = body.businessId ?? profile?.active_business_id
  if (!businessId) return json({ error: 'No business' }, 400)

  // Verify caller is admin of this business (or platform admin)
  if (!profile?.platform_admin) {
    const { data: membership } = await sb
      .from('business_members')
      .select('role')
      .eq('business_id', businessId)
      .eq('user_id', auth.userId)
      .eq('status', 'active')
      .maybeSingle()
    if (membership?.role !== 'admin') return json({ error: 'Admins only' }, 403)
  }

  // Load business ad credentials
  const { data: settings } = await sb
    .from('business_settings')
    .select(`
      meta_pixel_id, meta_capi_token,
      google_ads_customer_id, google_ads_developer_token,
      google_ads_refresh_token, google_ads_oauth_client_id,
      google_ads_oauth_client_secret, google_ads_conversion_action
    `)
    .eq('business_id', businessId)
    .single()

  const metaConfigured = !!(settings?.meta_pixel_id && settings?.meta_capi_token)
  const googleConfigured = !!(
    settings?.google_ads_customer_id &&
    settings?.google_ads_developer_token &&
    settings?.google_ads_refresh_token &&
    settings?.google_ads_oauth_client_id &&
    settings?.google_ads_oauth_client_secret &&
    settings?.google_ads_conversion_action
  )

  // Load unprocessed queue rows for this business
  const { data: queue, error: qErr } = await sb
    .from('conversion_queue')
    .select(`
      id, job_id, lead_id, meta_sent, google_sent,
      jobs!inner (
        won_at, value_final, value_est, business_id,
        contacts!inner ( email, phone )
      ),
      inbound_leads ( gclid, fbclid, raw_payload )
    `)
    .eq('business_id', businessId)
    .or('meta_sent.eq.false,google_sent.eq.false')
    .limit(50)

  if (qErr) return json({ error: qErr.message }, 500)
  if (!queue?.length) return json({ processed: 0, meta: { sent: 0, skipped: 0 }, google: { sent: 0, skipped: 0 } })

  const results = { processed: queue.length, meta: { sent: 0, skipped: 0, errors: [] as string[] }, google: { sent: 0, skipped: 0, errors: [] as string[] } }

  for (const row of queue) {
    const job = (row as any).jobs
    const contact = job?.contacts
    const lead = (row as any).inbound_leads

    const convData: ConversionData = {
      email: contact?.email ?? null,
      phone: contact?.phone ?? null,
      wonAt: job?.won_at ?? new Date().toISOString(),
      value: job?.value_final ?? job?.value_est ?? null,
      jobId: row.job_id,
    }

    const patch: Record<string, unknown> = {}

    // Meta CAPI
    if (!row.meta_sent) {
      if (!metaConfigured) {
        results.meta.skipped++
      } else {
        const r = await sendMetaCapi(
          { pixelId: settings!.meta_pixel_id!, capiToken: settings!.meta_capi_token! },
          convData,
        )
        if (r.ok) {
          patch.meta_sent = true
          patch.meta_sent_at = new Date().toISOString()
          patch.meta_error = null
          results.meta.sent++
        } else {
          patch.meta_error = r.error
          results.meta.errors.push(r.error ?? 'unknown')
        }
      }
    }

    // Google Ads
    if (!row.google_sent) {
      if (!googleConfigured) {
        results.google.skipped++
      } else {
        const r = await sendGoogleConversion(
          {
            customerId: settings!.google_ads_customer_id!,
            developerToken: settings!.google_ads_developer_token!,
            oauthClientId: settings!.google_ads_oauth_client_id!,
            oauthClientSecret: settings!.google_ads_oauth_client_secret!,
            refreshToken: settings!.google_ads_refresh_token!,
            conversionActionId: settings!.google_ads_conversion_action!,
          },
          convData,
        )
        if (r.ok) {
          patch.google_sent = true
          patch.google_sent_at = new Date().toISOString()
          patch.google_error = null
          results.google.sent++
        } else {
          patch.google_error = r.error
          results.google.errors.push(r.error ?? 'unknown')
        }
      }
    }

    if (Object.keys(patch).length) {
      await sb.from('conversion_queue').update(patch).eq('id', row.id)
    }
  }

  return json(results)
})
