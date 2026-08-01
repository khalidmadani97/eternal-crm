// Sara's shared brain (Slice 34): who is asking, and the operational
// snapshot she reasons over. Used by daily-brief and sara-chat.

import { SupabaseClient } from 'npm:@supabase/supabase-js@2'

export interface SaraCaller {
  name: string
  jobRole: string
  responsibilities: string
  teamDirectory: string
}

export async function loadCaller(sb: SupabaseClient, userId: string): Promise<SaraCaller> {
  const { data: teamRows, error } = await sb
    .from('profiles')
    .select('id, full_name, job_role, responsibilities, active_business_id')
    .not('active_business_id', 'is', null)
  if (error) throw new Error(error.message)
  const meRow = teamRows?.find((p) => p.id === userId)
  const myBusiness = meRow?.active_business_id
  const team = (teamRows ?? []).filter((p) => p.active_business_id === myBusiness)
  return {
    name: meRow?.full_name ?? 'the owner',
    jobRole: meRow?.job_role ?? 'Owner (role not set — assume they oversee everything)',
    responsibilities:
      meRow?.responsibilities ??
      'Not specified — assume overall responsibility for sales, production, and money.',
    teamDirectory: team
      .map(
        (p) =>
          `  ${p.full_name ?? 'Unnamed'} — ${p.job_role ?? 'no role set'} — ${p.responsibilities ?? 'no responsibilities set'}`,
      )
      .join('\n'),
  }
}

/** The business snapshot, scoped to the caller's active business. */
export async function buildSnapshot(sb: SupabaseClient, businessId: string | null) {
  const today = new Date().toISOString().slice(0, 10)
  const scope = <T extends { eq: (c: string, v: string) => T }>(q: T): T =>
    businessId ? q.eq('business_id', businessId) : q

  const [jobsRes, apptsRes, invoicesRes, tasksRes] = await Promise.all([
    scope(
      sb
        .from('jobs')
        .select(
          `id, job_number, title, stage, value_est, value_final, lead_source, created_at,
           assignee:profiles ( full_name ),
           contact:contacts ( id, full_name, last_contacted_at, last_contact_method )`,
        )
        .is('deleted_at', null)
        .not('stage', 'in', '(closed,lost)') as never,
    ),
    scope(
      sb
        .from('appointments')
        .select(
          'kind, starts_at, notes, assignee:profiles ( full_name ), job:jobs ( job_number, title, contact:contacts ( full_name ) )',
        )
        .gte('starts_at', `${today}T00:00:00Z`)
        .lte('starts_at', new Date(Date.now() + 7 * 86400_000).toISOString())
        .order('starts_at') as never,
    ),
    scope(
      sb
        .from('invoices')
        .select(
          'invoice_number, due_date, total, amount_paid, job:jobs ( job_number, contact:contacts ( full_name ) )',
        )
        .in('status', ['sent', 'partial'])
        .lt('due_date', today) as never,
    ),
    scope(
      sb
        .from('tasks')
        .select('title, due_date, assignee:profiles ( full_name ), job:jobs ( job_number )')
        .is('completed_at', null)
        .not('due_date', 'is', null)
        .lte('due_date', new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10)) as never,
    ),
  ]) as { data: unknown[] | null; error: { message: string } | null }[]
  for (const r of [jobsRes, apptsRes, invoicesRes, tasksRes]) {
    if (r.error) throw new Error(r.error.message)
  }

  const jobs = jobsRes.data as {
    id: string
    job_number: string
    title: string
    stage: string
    value_est: number | null
    value_final: number | null
    lead_source: string | null
    created_at: string
    assignee: { full_name: string | null } | null
    contact: {
      id: string
      full_name: string
      last_contacted_at: string | null
      last_contact_method: string | null
    } | null
  }[]

  const contactIds = [...new Set(jobs.map((j) => j.contact?.id).filter(Boolean))] as string[]
  const { data: recentActivity } = await sb
    .from('activities')
    .select('contact_id, kind, body, created_at, author:profiles ( full_name )')
    .in('contact_id', contactIds.length ? contactIds : ['00000000-0000-0000-0000-000000000000'])
    .in('kind', ['note', 'sms', 'dm', 'call', 'email', 'meeting'])
    .order('created_at', { ascending: false })
    .limit(250)

  const notesByContact = new Map<string, string[]>()
  for (const a of (recentActivity ?? []) as {
    contact_id: string | null
    kind: string
    body: string | null
    created_at: string
    author: { full_name: string | null } | null
  }[]) {
    if (!a.contact_id || !a.body) continue
    const list = notesByContact.get(a.contact_id) ?? []
    if (list.length < 6) {
      const author =
        a.author?.full_name ?? (a.kind === 'sms' || a.kind === 'dm' ? 'client/system' : 'unknown')
      list.push(`[${a.created_at.slice(0, 10)} ${a.kind} by ${author}] ${a.body.slice(0, 220)}`)
      notesByContact.set(a.contact_id, list)
    }
  }

  return {
    today,
    open_jobs: jobs.map((j) => ({
      job_id: j.id,
      job_number: j.job_number,
      title: j.title,
      stage: j.stage,
      value: j.value_final ?? j.value_est,
      assigned_to: j.assignee?.full_name ?? null,
      age_days: Math.floor((Date.now() - new Date(j.created_at).getTime()) / 86400_000),
      contact_id: j.contact?.id ?? null,
      contact: j.contact?.full_name ?? null,
      days_since_contact: j.contact?.last_contacted_at
        ? Math.floor((Date.now() - new Date(j.contact.last_contacted_at).getTime()) / 86400_000)
        : null,
      recent_notes: j.contact ? (notesByContact.get(j.contact.id) ?? []) : [],
    })),
    appointments_next_7_days: apptsRes.data ?? [],
    overdue_invoices: ((invoicesRes.data ?? []) as Record<string, unknown>[]).map((inv) => ({
      ...inv,
      balance: Number(inv.total) - Number(inv.amount_paid),
    })),
    open_tasks: tasksRes.data ?? [],
    // Who is already loaded this week — so new tasks get placed sparingly.
    task_load_next_7_days: Object.fromEntries(
      ((tasksRes.data ?? []) as { assignee: { full_name: string | null } | null }[]).reduce(
        (m, t) => {
          const who = t.assignee?.full_name ?? 'unassigned'
          m.set(who, (m.get(who) ?? 0) + 1)
          return m
        },
        new Map<string, number>(),
      ),
    ),
  }
}

export async function callerBusinessId(sb: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await sb.from('profiles').select('active_business_id').eq('id', userId).single()
  return data?.active_business_id ?? null
}
