// Human gate for Sara's staged bulk actions (Slice 46, DECISIONS 036).
//   {action:'execute', id, phrase} — admin, same business, phrase must match
//     exactly, pending + unexpired. Applies the patch; keeps per-row undo.
//   {action:'undo', id}            — within 24h of execution; restores rows.
//   {action:'cancel', id}
// The AI never touches this endpoint's inputs — the phrase comes from a
// human keyboard.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { json, requireStaff } from '../_shared/twilio.ts'

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const auth = await requireStaff(req)
  if (auth instanceof Response) return auth

  let body: { action?: string; id?: string; phrase?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  if (!body.id) return json({ error: 'id required' }, 400)

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: action } = await sb
    .from('pending_actions')
    .select('*')
    .eq('id', body.id)
    .maybeSingle()
  if (!action) return json({ error: 'Action not found' }, 404)

  // Caller must be an admin of the action's business (or platform admin).
  const [{ data: me }, { data: membership }] = await Promise.all([
    sb.from('profiles').select('platform_admin, active_business_id').eq('id', auth.userId).single(),
    sb.from('business_members').select('role')
      .eq('business_id', action.business_id).eq('user_id', auth.userId)
      .eq('status', 'active').maybeSingle(),
  ])
  const isAdmin = !!me?.platform_admin || membership?.role === 'admin'
  if (!isAdmin || me?.active_business_id !== action.business_id) {
    return json({ error: 'Only an admin of this business can act on this' }, 403)
  }

  const targets = action.targets as { id: string; prev: Record<string, string | null> }[]

  if (body.action === 'cancel') {
    if (action.status !== 'pending') return json({ error: `Already ${action.status}` }, 409)
    await sb.from('pending_actions').update({ status: 'cancelled' }).eq('id', action.id)
    return json({ cancelled: true })
  }

  if (body.action === 'execute') {
    if (action.status !== 'pending') return json({ error: `Already ${action.status}` }, 409)
    if (new Date(action.expires_at) < new Date()) {
      await sb.from('pending_actions').update({ status: 'expired' }).eq('id', action.id)
      return json({ error: 'This action expired (15 min) — ask Sara again.' }, 410)
    }
    if ((body.phrase ?? '').trim().toUpperCase() !== action.confirm_phrase.toUpperCase()) {
      return json({ error: `Type the exact phrase "${action.confirm_phrase}" to execute.` }, 400)
    }
    const patch = action.patch as Record<string, string | null>
    const ids = targets.map((t) => t.id)
    for (let i = 0; i < ids.length; i += 100) {
      const { error } = await sb
        .from('jobs')
        .update(patch)
        .in('id', ids.slice(i, i + 100))
        .eq('business_id', action.business_id)
      if (error) return json({ error: `Failed after ${i} rows: ${error.message}` }, 500)
    }
    await sb.from('pending_actions')
      .update({ status: 'executed', executed_at: new Date().toISOString() })
      .eq('id', action.id)
    await sb.from('activities').insert({
      business_id: action.business_id,
      kind: 'system',
      body: `Sara bulk action executed by admin: ${action.summary}`,
      meta: { pending_action_id: action.id },
      user_id: auth.userId,
    })
    return json({ executed: true, count: ids.length })
  }

  if (body.action === 'undo') {
    if (action.status !== 'executed') return json({ error: `Cannot undo — status is ${action.status}` }, 409)
    if (action.executed_at && Date.now() - new Date(action.executed_at).getTime() > 24 * 3600_000) {
      return json({ error: 'Undo window (24h) has passed.' }, 410)
    }
    for (const t of targets) {
      const { error } = await sb
        .from('jobs')
        .update(t.prev)
        .eq('id', t.id)
        .eq('business_id', action.business_id)
      if (error) return json({ error: error.message }, 500)
    }
    await sb.from('pending_actions').update({ status: 'undone' }).eq('id', action.id)
    await sb.from('activities').insert({
      business_id: action.business_id,
      kind: 'system',
      body: `Sara bulk action UNDONE by admin: ${action.summary}`,
      meta: { pending_action_id: action.id },
      user_id: auth.userId,
    })
    return json({ undone: true, count: targets.length })
  }

  return json({ error: 'action must be execute, cancel, or undo' }, 400)
})
