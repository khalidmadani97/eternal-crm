// Mints a Twilio Voice access token for the feature-flagged browser
// softphone (Slice 13, DECISIONS 023). Staff-only. The token is a Twilio
// FPA JWT signed HS256 with the API secret — credentials never reach the
// browser, only the short-lived token does.

import { CORS_HEADERS, json, requireStaff } from '../_shared/twilio.ts'

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

async function signJwt(header: object, payload: object, secret: string): Promise<string> {
  const enc = new TextEncoder()
  const head = base64url(enc.encode(JSON.stringify(header)))
  const body = base64url(enc.encode(JSON.stringify(payload)))
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(`${head}.${body}`))
  return `${head}.${body}.${base64url(new Uint8Array(mac))}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const auth = await requireStaff(req)
  if (auth instanceof Response) return auth

  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')
  const apiKey = Deno.env.get('TWILIO_API_KEY')
  const apiSecret = Deno.env.get('TWILIO_API_SECRET')
  const twimlAppSid = Deno.env.get('TWILIO_TWIML_APP_SID')
  if (!accountSid || !apiKey || !apiSecret || !twimlAppSid) {
    return json(
      { error: 'Softphone is not configured — set TWILIO_API_KEY/SECRET and TWILIO_TWIML_APP_SID' },
      503,
    )
  }

  const now = Math.floor(Date.now() / 1000)
  const identity = `staff-${auth.userId.slice(0, 8)}`
  const token = await signJwt(
    { typ: 'JWT', alg: 'HS256', cty: 'twilio-fpa;v=1' },
    {
      jti: `${apiKey}-${now}`,
      iss: apiKey,
      sub: accountSid,
      iat: now,
      exp: now + 3600,
      grants: {
        identity,
        voice: { outgoing: { application_sid: twimlAppSid } },
      },
    },
    apiSecret,
  )
  return json({ token, identity })
})
