// Stripe webhook — records card payments. Signature-validated (403 on
// failure), idempotent on the payment intent id. verify_jwt is off for this
// function (Stripe cannot send a Supabase JWT); the HMAC signature is the
// authentication.

import { createClient } from 'npm:@supabase/supabase-js@2'

const encoder = new TextEncoder()

async function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
): Promise<boolean> {
  if (!header) return false
  const parts = new Map(
    header.split(',').map((p) => {
      const [k, ...rest] = p.split('=')
      return [k.trim(), rest.join('=')] as const
    }),
  )
  const timestamp = parts.get('t')
  const signature = parts.get('v1')
  if (!timestamp || !signature) return false

  // 5-minute replay tolerance.
  const age = Math.abs(Date.now() / 1000 - Number(timestamp))
  if (!Number.isFinite(age) || age > 300) return false

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${payload}`))
  const expected = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  if (expected.length !== signature.length) return false
  let mismatch = 0
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i)
  }
  return mismatch === 0
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
  if (!secret) return new Response('Webhook secret not configured', { status: 503 })

  const payload = await req.text()
  const valid = await verifyStripeSignature(payload, req.headers.get('Stripe-Signature'), secret)
  if (!valid) return new Response('Invalid signature', { status: 403 })

  let event: {
    type: string
    data: {
      object: {
        id: string
        payment_intent?: string
        amount_total?: number
        metadata?: Record<string, string>
        payment_status?: string
      }
    }
  }
  try {
    event = JSON.parse(payload)
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  if (event.type !== 'checkout.session.completed') {
    return new Response(JSON.stringify({ received: true, ignored: event.type }), { status: 200 })
  }

  const session = event.data.object
  if (session.payment_status && session.payment_status !== 'paid') {
    return new Response(JSON.stringify({ received: true, ignored: 'not paid' }), { status: 200 })
  }
  const invoiceId = session.metadata?.invoice_id
  const reference = session.payment_intent ?? session.id
  const amount = (session.amount_total ?? 0) / 100
  if (!invoiceId || amount <= 0) {
    return new Response(JSON.stringify({ received: true, ignored: 'missing metadata' }), {
      status: 200,
    })
  }

  const service = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Idempotency: one payment row per payment intent, however many replays.
  const { data: existing, error: existingError } = await service
    .from('payments')
    .select('id')
    .eq('reference', reference)
    .maybeSingle()
  if (existingError) return new Response(existingError.message, { status: 500 })
  if (existing) {
    return new Response(JSON.stringify({ received: true, duplicate: true }), { status: 200 })
  }

  const { data: invoice, error: invoiceError } = await service
    .from('invoices')
    .select('id, job_id')
    .eq('id', invoiceId)
    .maybeSingle()
  if (invoiceError) return new Response(invoiceError.message, { status: 500 })
  if (!invoice) return new Response('Unknown invoice', { status: 200 }) // don't make Stripe retry forever

  const { error: insertError } = await service.from('payments').insert({
    job_id: invoice.job_id,
    invoice_id: invoice.id,
    kind: 'progress',
    method: 'card',
    amount,
    received_at: new Date().toISOString().slice(0, 10),
    reference,
  })
  if (insertError) return new Response(insertError.message, { status: 500 })

  return new Response(JSON.stringify({ received: true }), { status: 200 })
})
