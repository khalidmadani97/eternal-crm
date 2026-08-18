// Team/client invites & membership management (Slices 44, 52). All team
// writes go through here (service role) so RLS on business_members/invites
// stays read-only for the app.
//   {action:'send', email, role?, businessId?} — admin of the business (or
//     platform admin). Existing account → added immediately. No account →
//     single-use signup link, emailed via Resend when configured; the link
//     is ALWAYS returned so it can be copied manually.
//   {action:'accept', token} — called by the freshly signed-up user; joins
//     them to the inviting business with the invited role.
//   {action:'set-role', userId, role, businessId?} — admin changes a member's
//     role. Refuses to demote the last admin.
//   {action:'remove', userId, businessId?} — admin removes a member from the
//     business (account & other workspaces untouched). Refuses the last admin.
//   {action:'revoke', email, businessId?} — admin cancels a pending invite.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { CORS_HEADERS, json, requireStaff } from '../_shared/twilio.ts'

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

// Resolve the target business and confirm the caller may administer it.
// Returns the business id, or a ready-to-send error Response.
async function authorizeBusiness(
  sb: ReturnType<typeof service>,
  userId: string,
  businessId?: string,
): Promise<{ businessId: string } | Response> {
  const { data: me } = await sb
    .from('profiles')
    .select('active_business_id, platform_admin')
    .eq('id', userId)
    .single()
  const target = businessId ?? me?.active_business_id
  if (!target) return json({ error: 'No business to manage' }, 400)
  if (!me?.platform_admin) {
    const { data: membership } = await sb
      .from('business_members')
      .select('role')
      .eq('business_id', target)
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle()
    if (membership?.role !== 'admin') return json({ error: 'Business admins only' }, 403)
  }
  return { businessId: target }
}

// True when removing/demoting this user would leave the business with no
// active admin.
async function isLastAdmin(
  sb: ReturnType<typeof service>,
  businessId: string,
  userId: string,
): Promise<boolean> {
  const { count } = await sb
    .from('business_members')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .eq('status', 'active')
    .eq('role', 'admin')
    .neq('user_id', userId)
  return (count ?? 0) === 0
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const auth = await requireStaff(req)
  if (auth instanceof Response) return auth

  let body: {
    action?: string
    email?: string
    role?: string
    businessId?: string
    token?: string
    userId?: string
  }
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

    const authorized = await authorizeBusiness(sb, auth.userId, body.businessId)
    if (authorized instanceof Response) return authorized
    const { businessId } = authorized
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

  if (body.action === 'set-role') {
    if (!body.userId) return json({ error: 'userId required' }, 400)
    const role = body.role === 'admin' ? 'admin' : 'staff'
    const authorized = await authorizeBusiness(sb, auth.userId, body.businessId)
    if (authorized instanceof Response) return authorized
    const { businessId } = authorized
    if (role !== 'admin' && (await isLastAdmin(sb, businessId, body.userId))) {
      return json({ error: 'This is the last admin — promote someone else first.' }, 409)
    }
    const { error, count } = await sb
      .from('business_members')
      .update({ role }, { count: 'exact' })
      .eq('business_id', businessId)
      .eq('user_id', body.userId)
    if (error) return json({ error: error.message }, 500)
    if (!count) return json({ error: 'That person is not a member of this business.' }, 404)
    return json({ updated: true })
  }

  if (body.action === 'remove') {
    if (!body.userId) return json({ error: 'userId required' }, 400)
    const authorized = await authorizeBusiness(sb, auth.userId, body.businessId)
    if (authorized instanceof Response) return authorized
    const { businessId } = authorized
    const { data: target } = await sb
      .from('business_members')
      .select('role')
      .eq('business_id', businessId)
      .eq('user_id', body.userId)
      .maybeSingle()
    if (!target) return json({ error: 'That person is not a member of this business.' }, 404)
    if (target.role === 'admin' && (await isLastAdmin(sb, businessId, body.userId))) {
      return json({ error: 'This is the last admin — promote someone else first.' }, 409)
    }
    const { error } = await sb
      .from('business_members')
      .delete()
      .eq('business_id', businessId)
      .eq('user_id', body.userId)
    if (error) return json({ error: error.message }, 500)
    // If they were parked in this workspace, move them to another one (or none).
    const { data: next } = await sb
      .from('business_members')
      .select('business_id')
      .eq('user_id', body.userId)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle()
    await sb
      .from('profiles')
      .update({ active_business_id: next?.business_id ?? null })
      .eq('id', body.userId)
      .eq('active_business_id', businessId)
    return json({ removed: true })
  }

  if (body.action === 'revoke') {
    const email = body.email?.trim().toLowerCase()
    if (!email) return json({ error: 'email required' }, 400)
    const authorized = await authorizeBusiness(sb, auth.userId, body.businessId)
    if (authorized instanceof Response) return authorized
    const { businessId } = authorized
    const { error } = await sb
      .from('invites')
      .delete()
      .eq('business_id', businessId)
      .ilike('email', email)
      .is('accepted_at', null)
    if (error) return json({ error: error.message }, 500)
    return json({ revoked: true })
  }

  return json({ error: 'unknown action' }, 400)
})
