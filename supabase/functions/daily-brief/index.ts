// Role-aware Daily Brief agent (Slices 24+29, DECISIONS 027/029).
//
// Knows WHO is asking: their job role and free-text responsibilities, plus
// the whole team directory. Notes carry their authors, so the model can
// route cross-role signals by name — a salesperson's "not sure we can do X"
// lands in the production manager's brief as "check it and get back to
// them", while lead-chasing lands with sales, and overdue money with the
// office. Advisory only: it writes nothing without a click.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { checkAiCredits, json, logAiUsage, requireStaff } from '../_shared/twilio.ts'

function systemPrompt(me: {
  name: string
  jobRole: string
  responsibilities: string
}, team: string): string {
  return `You are Sara, the operations brain of a small custom-interiors company
(countertops, millwork) in Ontario.

You are briefing ONE person:
  Name: ${me.name}
  Company role: ${me.jobRole}
  Responsibilities: ${me.responsibilities}

Team directory (name — role — responsibilities):
${team}

You get a JSON snapshot: open leads/jobs (stage, value, days since the
client was last contacted, recent notes WITH THEIR AUTHORS — including voice
transcripts), appointments for the next 7 days, overdue invoices, and open
tasks with assignees.

Build THEIR day, not a generic one:
1. Lead with what falls under THEIR responsibilities.
2. Route cross-role signals to them by name: if someone ELSE's note reveals
   something this person must act on — e.g. a salesperson unsure whether
   production can do something for a client ("not sure if we can book-match
   this"), a production note about a delay the client hasn't been told
   about, an installer flagging a site problem — surface it as: "<author>
   wasn't sure/flagged <thing> for <client> — check it and get back to
   them."
3. Do NOT fill their brief with other people's lanes. A production manager
   does not chase cold leads; sales does not schedule fabrication. Mention
   out-of-lane items only when business-critical, and say whose lane it is.
4. Weigh explicit signals in notes ("waiting on spouse", "call after the
   15th") properly. Never invent people, jobs, or numbers not in the data.

Return STRICT JSON only:
{
  "summary": "3-6 sentences addressed to ${me.name}: their day, their risks, their priorities",
  "urgent": [
    {
      "contact_id": "..." | null, "job_id": "..." | null,
      "who": "client or teammate this is about", "job_number": "EI-... or null",
      "category": "outreach" | "production" | "internal" | "money" | "schedule",
      "reason": "one concrete sentence: why this matters to ${me.name} today (name the note author when routing a cross-role signal)",
      "action": "specific next step",
      "priority": 1-5,
      "task_title": "short imperative task",
      "due": "YYYY-MM-DD"
    }
  ]
}
Max 8 items, highest priority first.`
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const auth = await requireStaff(req)
  if (auth instanceof Response) return auth

  const apiKey = Deno.env.get('AI_API_KEY')
  if (!apiKey) return json({ error: 'AI agent not configured — set AI_API_KEY (any OpenAI-compatible provider)' }, 503)
  const apiBase = Deno.env.get('AI_API_BASE') ?? 'https://api.moonshot.ai/v1'
  const model = Deno.env.get('AI_MODEL') ?? 'kimi-k2-0711-preview'

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const credits = await checkAiCredits(sb, auth.userId)
  if (!credits.allowed) {
    return json(
      {
        error: `AI credits used up for this month (${credits.used}/${credits.cap}). An admin can grant extra in Settings → AI usage.`,
        usage: credits,
      },
      429,
    )
  }

  const today = new Date().toISOString().slice(0, 10)

  // ── Who is asking, and who exists ────────────────────────────────────────
  const { data: teamRows, error: teamError } = await sb
    .from('profiles')
    .select('id, full_name, job_role, responsibilities')
  if (teamError) return json({ error: teamError.message }, 500)
  const meRow = teamRows?.find((p) => p.id === auth.userId)
  const me = {
    name: meRow?.full_name ?? 'the owner',
    jobRole: meRow?.job_role ?? 'Owner (role not set — assume they oversee everything)',
    responsibilities:
      meRow?.responsibilities ??
      'Not specified — assume overall responsibility for sales, production, and money.',
  }
  const teamDirectory = (teamRows ?? [])
    .map(
      (p) =>
        `  ${p.full_name ?? 'Unnamed'} — ${p.job_role ?? 'no role set'} — ${p.responsibilities ?? 'no responsibilities set'}`,
    )
    .join('\n')

  // ── Snapshot ──────────────────────────────────────────────────────────────
  const [jobsRes, apptsRes, invoicesRes, tasksRes] = await Promise.all([
    sb
      .from('jobs')
      .select(
        `id, job_number, title, stage, value_est, value_final, lead_source, created_at,
         assignee:profiles ( full_name ),
         contact:contacts ( id, full_name, last_contacted_at, last_contact_method )`,
      )
      .is('deleted_at', null)
      .not('stage', 'in', '(closed,lost)'),
    sb
      .from('appointments')
      .select(
        'kind, starts_at, notes, assignee:profiles ( full_name ), job:jobs ( job_number, title, contact:contacts ( full_name ) )',
      )
      .gte('starts_at', `${today}T00:00:00Z`)
      .lte('starts_at', new Date(Date.now() + 7 * 86400_000).toISOString())
      .order('starts_at'),
    sb
      .from('invoices')
      .select('invoice_number, due_date, total, amount_paid, job:jobs ( job_number, contact:contacts ( full_name ) )')
      .in('status', ['sent', 'partial'])
      .lt('due_date', today),
    sb
      .from('tasks')
      .select('title, due_date, assignee:profiles ( full_name ), job:jobs ( job_number )')
      .is('completed_at', null)
      .not('due_date', 'is', null)
      .lte('due_date', new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10)),
  ])
  for (const r of [jobsRes, apptsRes, invoicesRes, tasksRes]) {
    if (r.error) return json({ error: r.error.message }, 500)
  }

  const jobs = jobsRes.data as unknown as {
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

  // Recent notes with AUTHORS — the raw material for cross-role routing.
  const contactIds = [...new Set(jobs.map((j) => j.contact?.id).filter(Boolean))] as string[]
  const { data: recentActivity } = await sb
    .from('activities')
    .select('contact_id, job_id, kind, body, created_at, author:profiles ( full_name )')
    .in('contact_id', contactIds.length ? contactIds : ['00000000-0000-0000-0000-000000000000'])
    .in('kind', ['note', 'sms', 'dm', 'call', 'email', 'meeting'])
    .order('created_at', { ascending: false })
    .limit(250)

  const notesByContact = new Map<string, string[]>()
  for (const a of (recentActivity ?? []) as unknown as {
    contact_id: string | null
    kind: string
    body: string | null
    created_at: string
    author: { full_name: string | null } | null
  }[]) {
    if (!a.contact_id || !a.body) continue
    const list = notesByContact.get(a.contact_id) ?? []
    if (list.length < 6) {
      const author = a.author?.full_name ?? (a.kind === 'sms' || a.kind === 'dm' ? 'client/system' : 'unknown')
      list.push(`[${a.created_at.slice(0, 10)} ${a.kind} by ${author}] ${a.body.slice(0, 220)}`)
      notesByContact.set(a.contact_id, list)
    }
  }

  const snapshot = {
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
    overdue_invoices: (invoicesRes.data ?? []).map((inv: Record<string, unknown>) => ({
      ...inv,
      balance:
        Number((inv as { total: number }).total) -
        Number((inv as { amount_paid: number }).amount_paid),
    })),
    open_tasks: tasksRes.data ?? [],
  }

  const llmRes = await fetch(`${apiBase}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt(me, teamDirectory) },
        { role: 'user', content: JSON.stringify(snapshot) },
      ],
    }),
  })
  const llmBody = await llmRes.json()
  if (!llmRes.ok) {
    return json({ error: `LLM (${model}): ${llmBody?.error?.message ?? llmRes.status}` }, 502)
  }
  let brief: unknown
  try {
    brief = JSON.parse(llmBody.choices[0].message.content)
  } catch {
    return json({ error: 'The model returned malformed JSON — try again' }, 502)
  }

  await logAiUsage(
    sb, auth.userId, 'daily-brief', model,
    llmBody.usage?.prompt_tokens ?? null, llmBody.usage?.completion_tokens ?? null,
  )

  return json({
    brief,
    model,
    generated_at: new Date().toISOString(),
    for: { name: me.name, job_role: meRow?.job_role ?? null },
    usage: { used: credits.used + 1, cap: credits.cap },
  })
})
