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
import { buildSnapshot, callerBusinessId, loadCaller } from '../_shared/sara.ts'

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

flagged_recent_notes are recent HUMAN-written notes — explicit
instructions/dates in them are commitments and MUST surface as urgent items
on their day (e.g. "call these guys today" → a P1 for today).

You get a JSON snapshot: open leads/jobs (stage, value, days since the
client was last contacted, recent notes WITH THEIR AUTHORS — including voice
transcripts), appointments for the next 7 days, overdue invoices, and open
tasks with assignees.

Build THEIR day, not a generic one:
0. MANDATORY: every flagged_recent_notes entry dated today or earlier that
   contains an instruction ("call X today", "quote by Friday") becomes its
   own urgent item at the top — these are explicit human commitments and
   skipping one is a failure.
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

  const [caller2, businessId2] = await Promise.all([
    loadCaller(sb, auth.userId),
    callerBusinessId(sb, auth.userId),
  ])
  const snapshot = await buildSnapshot(sb, businessId2)
  const me = {
    name: caller2.name,
    jobRole: caller2.jobRole,
    responsibilities: caller2.responsibilities,
    teamDirectory: caller2.teamDirectory,
  }

  const llmRes = await fetch(`${apiBase}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt(me, caller2.teamDirectory) },
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

  // Deterministic guarantee: a human note written TODAY always makes the
  // plan — if the model skipped one, inject it as P1 (models drift; notes
  // are commitments).
  try {
    const b = brief as { urgent?: Record<string, unknown>[] }
    const urgent = (b.urgent ?? []) as Record<string, unknown>[]
    const snapNotes = (snapshot as { flagged_recent_notes?: {
      date: string; author: string | null; about: string; job_id: string | null; note: string
    }[] }).flagged_recent_notes ?? []
    const today2 = new Date().toISOString().slice(0, 10)
    const mentioned = JSON.stringify(urgent).toLowerCase()
    const cutoff3 = new Date(Date.now() - 3 * 86400_000).toISOString().slice(0, 10)
    for (const n of snapNotes.filter((x) => x.date >= cutoff3)) {
      const key = (n.about.split(' ')[0] ?? '').toLowerCase()
      const covered =
        (n.job_id && mentioned.includes(n.job_id)) ||
        (key && key.length > 3 && mentioned.includes(key)) ||
        mentioned.includes(n.note.slice(0, 25).toLowerCase())
      if (!covered) {
        urgent.unshift({
          contact_id: null,
          job_id: n.job_id,
          who: n.about,
          job_number: n.about.startsWith('EI-') ? n.about.split(' ')[0] : null,
          category: 'internal',
          reason: `${n.date === today2 ? 'Note from today' : `Unaddressed note from ${n.date}`}${n.author ? ` (by ${n.author})` : ''}: "${n.note.slice(0, 160)}"`,
          action: 'Do what the note says',
          priority: 1,
          task_title: n.note.slice(0, 60),
          due: today2,
        })
      }
    }
    b.urgent = urgent.slice(0, 8)
  } catch { /* never fail the brief over the guarantee */ }

  await logAiUsage(
    sb, auth.userId, 'daily-brief', model,
    llmBody.usage?.prompt_tokens ?? null, llmBody.usage?.completion_tokens ?? null,
  )

  return json({
    brief,
    model,
    generated_at: new Date().toISOString(),
    for: { name: me.name, job_role: me.jobRole ?? null },
    usage: { used: credits.used + 1, cap: credits.cap },
  })
})
