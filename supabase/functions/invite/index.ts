// Team/client invites (Slice 44).
//   {action:'send', email, role?, businessId?} — admin of the business (or
//     platform admin). Existing account → added immediately. No account →
//     single-use signup link, emailed via Resend when configured; the link
//     is ALWAYS returned so it can be copied manually.
//   {action:'accept', token} — called by the freshly signed-up user; joins
//     them to the inviting business with the invited role.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { json, requireStaff } from '../_shared/twilio.ts'

function service() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
}

function inviteLink(token: string): string {
  const appUrl = Deno.env.get('APP_URL') ?? 'http://localhost:5173'
  return `${appUrl}/signup?invite=${token}`
}

async function sendInviteEmail(
  to: string,
  businessName: string,
  link: string,
): Promise<boolean> {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey) return false
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: Deno.env.get('EMAIL_FROM') ?? 'Eternal CRM <onboarding@resend.dev>',
      to: [to],
      subject: `You're invited to ${businessName}`,
      html: `<p>You've been invited to join <strong>${businessName}</strong>.</p><p><a href="${link}">Complete your signup here</a> — the link is single-use and valid for 14 days.</p>`,
    }),
  })
  return res.ok
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const auth = await requireStaff(req)
  if (auth instanceof Response) return auth

  let body: { action?: string; email?: string; role?: string; businessId?: string; token?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  const sb = service()

  if (body.action === 'send') {
    const email = body.email?.trim().toLowerCase()
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return json({ error: 'A valid email is required' }, 400)
    }
    const role = body.role === 'admin' ? 'admin' : 'staff'

    // Resolve + authorize the target business.
    const { data: me } = await sb
      .from('profiles')
      .select('active_business_id, platform_admin')
      .eq('id', auth.userId)
      .single()
    const businessId = body.businessId ?? me?.active_business_id
    if (!businessId) return json({ error: 'No business to invite into' }, 400)
    if (!me?.platform_admin) {
      const { data: membership } = await sb
        .from('business_members')
        .select('role')
        .eq('business_id', businessId)
        .eq('user_id', auth.userId)
        .eq('status', 'active')
        .maybeSingle()
      if (membership?.role !== 'admin') return json({ error: 'Business admins only' }, 403)
    }
    const { data: business } = await sb
      .from('businesses')
      .select('name')
      .eq('id', businessId)
      .single()
    if (!business) return json({ error: 'Business not found' }, 404)

    // Already signed up → add immediately.
    const { data: existing } = await sb
      .from('profiles')
      .select('id')
      .ilike('email', email)
      .maybeSingle()
    if (existing) {
      const { error } = await sb
        .from('business_members')
        .upsert(
          { business_id: businessId, user_id: existing.id, role, status: 'active' },
          { onConflict: 'business_id,user_id' },
        )
      if (error) return json({ error: error.message }, 500)
      await sb
        .from('profiles')
        .update({ active_business_id: businessId })
        .eq('id', existing.id)
        .is('active_business_id', null)
      return json({ added: true, business: business.name })
    }

    // New person → invite token + link.
    const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
    const { error: inviteError } = await sb.from('invites').upsert(
      {
        business_id: businessId,
        email,
        role,
        token,
        invited_by: auth.userId,
        expires_at: new Date(Date.now() + 14 * 86400_000).toISOString(),
        accepted_at: null,
      },
      { onConflict: 'business_id,email' },
    )
    if (inviteError) return json({ error: inviteError.message }, 500)
    const link = inviteLink(token)
    const emailed = await sendInviteEmail(email, business.name, link).catch(() => false)
    return json({ invited: true, emailed, link, business: business.name })
  }

  if (body.action === 'accept') {
    if (!body.token) return json({ error: 'token required' }, 400)
    const { data: invite } = await sb
      .from('invites')
      .select('id, business_id, email, role, expires_at, accepted_at')
      .eq('token', body.token)
      .maybeSingle()
    if (!invite) return json({ error: 'This invite link is not valid.' }, 404)
    if (invite.accepted_at) return json({ error: 'This invite was already used.' }, 409)
    if (new Date(invite.expires_at) < new Date()) {
      return json({ error: 'This invite has expired — ask for a fresh one.' }, 410)
    }
    const { error: memberError } = await sb.from('business_members').upsert(
      { business_id: invite.business_id, user_id: auth.userId, role: invite.role, status: 'active' },
      { onConflict: 'business_id,user_id' },
    )
    if (memberError) return json({ error: memberError.message }, 500)
    await sb.from('profiles').update({ active_business_id: invite.business_id }).eq('id', auth.userId)
    await sb
      .from('invites')
      .update({ accepted_at: new Date().toISOString() })
      .eq('id', invite.id)
    const { data: business } = await sb
      .from('businesses')
      .select('name')
      .eq('id', invite.business_id)
      .single()
    return json({ joined: true, business: business?.name })
  }

  return json({ error: 'action must be send or accept' }, 400)
})
