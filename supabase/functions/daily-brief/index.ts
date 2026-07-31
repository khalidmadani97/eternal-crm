// Daily Brief agent (Slice 24, DECISIONS 027). Gathers the operational
// state — open leads with stage/value/last-contact recency and recent notes
// (including voice-note transcripts), today's and upcoming appointments,
// overdue invoices, open tasks — and asks an LLM for a prioritised plan of
// the day: who to contact NOW and why, plus a suggested task for each.
//
// Provider: OpenAI-compatible. Defaults to Moonshot Kimi (K2 — materially
// cheaper than GPT-4-class): AI_API_KEY required; AI_API_BASE and AI_MODEL
// override the defaults.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { json, requireStaff } from '../_shared/twilio.ts'

const SYSTEM_PROMPT = `You are the operations brain of a small custom-interiors
company (countertops, millwork) in Ontario. You are given today's date and a
compact JSON snapshot: open leads/jobs (stage, value, lead source, days since
last contact, recent notes and message snippets), today's appointments,
overdue invoices, and open tasks.

Return STRICT JSON only, matching:
{
  "summary": "3-6 sentence plain-language briefing of the day: what's scheduled, what's at risk, what matters most",
  "urgent": [
    {
      "contact_id": "...", "job_id": "..." | null,
      "who": "contact name", "job_number": "EI-... or null",
      "reason": "one concrete sentence: why now (stage + recency + signal from notes)",
      "action": "specific next step, e.g. 'Call to close — quote expires Friday'",
      "priority": 1-5,
      "task_title": "short imperative task",
      "due": "YYYY-MM-DD"
    }
  ]
}

Rules: max 8 urgent items, highest priority first. Quoted/follow-up leads
going quiet beat everything except today's installs and badly overdue
invoices. Never invent people or numbers not in the data. Weigh explicit
signals in notes ("waiting on spouse", "call after the 15th") properly.`

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const auth = await requireStaff(req)
  if (auth instanceof Response) return auth

  const apiKey = Deno.env.get('AI_API_KEY')
  if (!apiKey) return json({ error: 'AI agent not configured — set AI_API_KEY (Moonshot/Kimi or any OpenAI-compatible provider)' }, 503)
  const apiBase = Deno.env.get('AI_API_BASE') ?? 'https://api.moonshot.ai/v1'
  const model = Deno.env.get('AI_MODEL') ?? 'kimi-k2-0711-preview'

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const today = new Date().toISOString().slice(0, 10)

  // ── Snapshot ──────────────────────────────────────────────────────────────
  const [jobsRes, apptsRes, invoicesRes, tasksRes] = await Promise.all([
    sb
      .from('jobs')
      .select(
        `id, job_number, title, stage, value_est, value_final, lead_source, created_at,
         contact:contacts ( id, full_name, last_contacted_at, last_contact_method )`,
      )
      .is('deleted_at', null)
      .not('stage', 'in', '(closed,lost)'),
    sb
      .from('appointments')
      .select('kind, starts_at, notes, job:jobs ( job_number, title, contact:contacts ( full_name ) )')
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

  // Recent notes/messages per open job's contact (transcripts live in
  // activities bodies too).
  const jobs = jobsRes.data as unknown as {
    id: string
    job_number: string
    title: string
    stage: string
    value_est: number | null
    value_final: number | null
    lead_source: string | null
    created_at: string
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
    .select('contact_id, job_id, kind, body, created_at')
    .in('contact_id', contactIds.length ? contactIds : ['00000000-0000-0000-0000-000000000000'])
    .in('kind', ['note', 'sms', 'dm', 'call', 'email', 'meeting'])
    .order('created_at', { ascending: false })
    .limit(200)

  const notesByContact = new Map<string, string[]>()
  for (const a of recentActivity ?? []) {
    if (!a.contact_id || !a.body) continue
    const list = notesByContact.get(a.contact_id) ?? []
    if (list.length < 5) {
      list.push(`[${a.created_at.slice(0, 10)} ${a.kind}] ${a.body.slice(0, 200)}`)
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
      lead_source: j.lead_source,
      age_days: Math.floor((Date.now() - new Date(j.created_at).getTime()) / 86400_000),
      contact_id: j.contact?.id ?? null,
      contact: j.contact?.full_name ?? null,
      days_since_contact: j.contact?.last_contacted_at
        ? Math.floor((Date.now() - new Date(j.contact.last_contacted_at).getTime()) / 86400_000)
        : null,
      last_method: j.contact?.last_contact_method ?? null,
      recent_notes: j.contact ? (notesByContact.get(j.contact.id) ?? []) : [],
    })),
    appointments_next_7_days: (apptsRes.data ?? []).map((a: Record<string, unknown>) => a),
    overdue_invoices: (invoicesRes.data ?? []).map((inv: Record<string, unknown>) => ({
      ...inv,
      balance:
        Number((inv as { total: number }).total) -
        Number((inv as { amount_paid: number }).amount_paid),
    })),
    open_tasks: tasksRes.data ?? [],
  }

  // ── LLM ───────────────────────────────────────────────────────────────────
  const llmRes = await fetch(`${apiBase}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
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

  return json({ brief, model, generated_at: new Date().toISOString() })
})
