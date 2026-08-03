// Creates a Stripe Checkout link for an invoice's outstanding balance and
// stores it on the invoice. Staff-only. Credentials live in function secrets
// (STRIPE_SECRET_KEY) — never in VITE_ variables.

import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
  const appUrl = Deno.env.get('APP_URL') ?? 'http://localhost:5173'

  const asCaller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: userData, error: userError } = await asCaller.auth.getUser()
  if (userError || !userData.user) return json({ error: 'Not authenticated' }, 401)

  if (!stripeKey) {
    return json({ error: 'Stripe is not configured — set STRIPE_SECRET_KEY in function secrets' }, 503)
  }

  let invoiceId: unknown
  try {
    ;({ invoiceId } = await req.json())
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  if (typeof invoiceId !== 'string') return json({ error: 'invoiceId is required' }, 400)

  const service = createClient(supabaseUrl, serviceKey)
  const { data: invoice, error: invoiceError } = await service
    .from('invoices')
    .select('id, invoice_number, status, total, amount_paid, job_id')
    .eq('id', invoiceId)
    .maybeSingle()
  if (invoiceError) return json({ error: invoiceError.message }, 500)
  if (!invoice) return json({ error: 'Invoice not found' }, 404)
  if (invoice.status === 'draft' || invoice.status === 'void') {
    return json({ error: `Cannot take payment on a ${invoice.status} invoice` }, 400)
  }

  const balanceCents = Math.round((Number(invoice.total) - Number(invoice.amount_paid)) * 100)
  if (balanceCents <= 0) return json({ error: 'Invoice has no outstanding balance' }, 400)

  // Checkout Session with inline price data; metadata rides through to the
  // webhook so the payment lands on the right invoice.
  const body = new URLSearchParams({
    mode: 'payment',
    'line_items[0][price_data][currency]': 'cad',
    'line_items[0][price_data][unit_amount]': String(balanceCents),
    'line_items[0][price_data][product_data][name]': `Invoice ${invoice.invoice_number} — Eternal Interiors`,
    'line_items[0][quantity]': '1',
    'metadata[invoice_id]': invoice.id,
    'metadata[job_id]': invoice.job_id,
    'payment_intent_data[metadata][invoice_id]': invoice.id,
    success_url: `${appUrl}/pay/success`,
    cancel_url: `${appUrl}/pay/cancelled`,
  })
  const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${stripeKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })
  const session = await stripeRes.json()
  if (!stripeRes.ok) {
    return json({ error: `Stripe: ${session?.error?.message ?? stripeRes.status}` }, 502)
  }

  const { error: updateError } = await service
    .from('invoices')
    .update({ stripe_payment_link: session.url })
    .eq('id', invoice.id)
  if (updateError) return json({ error: updateError.message }, 500)

  return json({ url: session.url })
})

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}
