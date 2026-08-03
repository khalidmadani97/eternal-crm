// Shared Twilio helpers for the comms edge functions (Slice 10).

import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2'

export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
}

export interface TwilioEnv {
  accountSid: string
  authToken: string
  businessNumber: string
  staffNumber: string
}

/** Returns null when Twilio is not configured — callers fail closed. */
export function twilioEnv(): TwilioEnv | null {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN')
  const businessNumber = Deno.env.get('TWILIO_BUSINESS_NUMBER')
  const staffNumber = Deno.env.get('TWILIO_STAFF_NUMBER')
  if (!accountSid || !authToken || !businessNumber || !staffNumber) return null
  return { accountSid, authToken, businessNumber, staffNumber }
}

/**
 * Twilio request validation: X-Twilio-Signature is
 * base64(HMAC-SHA1(authToken, url + sortedParamKey+value…)). A request that
 * fails validation gets a 403 — no exceptions (Slice 10 non-negotiable).
 */
export async function validateTwilioSignature(
  url: string,
  params: Record<string, string>,
  signature: string | null,
  authToken: string,
): Promise<boolean> {
  if (!signature) return false
  let data = url
  for (const key of Object.keys(params).sort()) data += key + params[key]
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(authToken),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  )
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)))
  if (expected.length !== signature.length) return false
  let mismatch = 0
  for (let i = 0; i < expected.length; i++) mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i)
  return mismatch === 0
}

/** The public URL Twilio signed — behind the Supabase gateway the function
 *  sees an internal URL, so webhooks reconstruct it from SUPABASE_URL. */
export function publicFunctionUrl(functionName: string, query = ''): string {
  const base = Deno.env.get('SUPABASE_URL')!
  return `${base}/functions/v1/${functionName}${query}`
}

/** Match a contact by exact E.164, or create an unverified one. */
export async function matchOrCreateContact(
  sb: SupabaseClient,
  phone: string,
): Promise<{ id: string; created: boolean }> {
  const { data: existing, error: findError } = await sb
    .from('contacts')
    .select('id')
    .eq('phone', phone)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (findError) throw new Error(findError.message)
  if (existing) return { id: existing.id, created: false }

  const { data: created, error: createError } = await sb
    .from('contacts')
    .insert({ full_name: `Unknown ${phone}`, phone, auto_created: true })
    .select('id')
    .single()
  if (createError) throw new Error(createError.message)
  return { id: created.id, created: true }
}

/** The most recent open job for a contact — where inbound comms should land. */
export async function latestOpenJob(sb: SupabaseClient, contactId: string): Promise<string | null> {
  const { data, error } = await sb
    .from('jobs')
    .select('id')
    .eq('contact_id', contactId)
    .is('deleted_at', null)
    .not('stage', 'in', '(closed,lost)')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data?.id ?? null
}

/**
 * CASL fail-closed check: an outbound SMS needs a live consent grant for the
 * destination number. Latest record wins; withdrawn or expired means NO.
 */
export async function hasSmsConsent(sb: SupabaseClient, phone: string): Promise<boolean> {
  const { data, error } = await sb
    .from('consent_records')
    .select('status, expires_at')
    .eq('phone_number', phone)
    .eq('channel', 'sms')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return false
  if (data.status === 'withdrawn') return false
  if (data.expires_at && new Date(data.expires_at) < new Date()) return false
  return true
}

export function twiml(inner: string): Response {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`, {
    headers: { 'Content-Type': 'text/xml' },
  })
}

// Functions are called cross-origin from the app (supabase.co ≠ app domain),
// so every browser-facing response needs CORS headers and OPTIONS preflights
// must be answered — the platform gateway does NOT do this for us. Auth still
// happens per-request; the wildcard origin exposes nothing on its own.
export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
} as const

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

export async function requireStaff(req: Request): Promise<{ userId: string } | Response> {
  const asCaller = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
  )
  const { data, error } = await asCaller.auth.getUser()
  if (error || !data.user) return json({ error: 'Not authenticated' }, 401)
  return { userId: data.user.id }
}

// ── AI credits (Slice 30) ────────────────────────────────────────────────────

const DEFAULT_MONTHLY_PROMPTS = 60

export interface CreditCheck {
  allowed: boolean
  used: number
  cap: number
}

/** Count this calendar month's AI calls against the user's cap. */
export async function checkAiCredits(sb: SupabaseClient, userId: string): Promise<CreditCheck> {
  const monthStart = new Date()
  monthStart.setUTCDate(1)
  monthStart.setUTCHours(0, 0, 0, 0)
  const [usageRes, allowanceRes] = await Promise.all([
    sb
      .from('ai_usage')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', monthStart.toISOString()),
    sb.from('ai_allowances').select('monthly_prompts, extra_prompts').eq('user_id', userId).maybeSingle(),
  ])
  const used = usageRes.count ?? 0
  const cap = allowanceRes.data
    ? allowanceRes.data.monthly_prompts + allowanceRes.data.extra_prompts
    : DEFAULT_MONTHLY_PROMPTS
  return { allowed: used < cap, used, cap }
}

export async function logAiUsage(
  sb: SupabaseClient,
  userId: string,
  functionName: string,
  model: string | null,
  promptTokens: number | null,
  completionTokens: number | null,
): Promise<void> {
  await sb.from('ai_usage').insert({
    user_id: userId,
    function_name: functionName,
    model,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
  })
}
