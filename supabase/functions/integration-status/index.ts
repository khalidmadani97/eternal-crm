// Integration health for Settings (Slice 31). Staff-only. Reports which
// integrations have their secrets configured — never the values.

import { json, requireStaff } from '../_shared/twilio.ts'

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const auth = await requireStaff(req)
  if (auth instanceof Response) return auth

  const has = (...keys: string[]) => keys.every((k) => !!Deno.env.get(k))
  return json({
    twilio: {
      configured: has('TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_BUSINESS_NUMBER', 'TWILIO_STAFF_NUMBER'),
      needs: 'TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_BUSINESS_NUMBER, TWILIO_STAFF_NUMBER',
      what: 'Calls and SMS from the business number',
    },
    softphone: {
      configured: has('TWILIO_API_KEY', 'TWILIO_API_SECRET', 'TWILIO_TWIML_APP_SID'),
      needs: 'TWILIO_API_KEY, TWILIO_API_SECRET, TWILIO_TWIML_APP_SID (+ VITE_FEATURE_SOFTPHONE=true)',
      what: 'Browser calling',
    },
    stripe: {
      configured: has('STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'),
      needs: 'STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, APP_URL',
      what: 'Card payment links on invoices',
    },
    meta: {
      configured: has('META_APP_SECRET', 'META_VERIFY_TOKEN'),
      sendConfigured: has('META_PAGE_TOKEN'),
      needs: 'META_APP_SECRET, META_VERIFY_TOKEN (+ META_PAGE_TOKEN to reply)',
      what: 'Messenger / Instagram DMs into the inbox',
    },
    ai: {
      configured: has('AI_API_KEY'),
      model: Deno.env.get('AI_MODEL') ?? 'kimi-k2-0711-preview',
      needs: 'AI_API_KEY (+ AI_API_BASE / AI_MODEL)',
      what: 'Daily Brief agent',
    },
    transcription: {
      configured: has('OPENAI_API_KEY') || has('TRANSCRIBE_API_KEY'),
      needs: 'OPENAI_API_KEY or TRANSCRIBE_API_KEY',
      what: 'Voice-note transcription (Whisper)',
    },
    calendarFeed: {
      configured: has('ICS_FEED_TOKEN'),
      needs: 'ICS_FEED_TOKEN',
      what: 'Google/Apple calendar subscription',
    },
    push: {
      configured: has('VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY'),
      needs: 'VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (+ VITE_VAPID_PUBLIC_KEY)',
      what: 'Push notifications on phones',
    },
  })
})
