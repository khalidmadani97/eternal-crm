// Sara — conversational assistant (Slice 34). Multi-turn chat over the live
// business snapshot, role-aware, credit-metered. Advisory only: she writes
// nothing; she tells you what to do and where to click.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { checkAiCredits, json, logAiUsage, requireStaff } from '../_shared/twilio.ts'
import { buildSnapshot, callerBusinessId, loadCaller } from '../_shared/sara.ts'

const MAX_TURNS = 14

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const auth = await requireStaff(req)
  if (auth instanceof Response) return auth

  const apiKey = Deno.env.get('AI_API_KEY')
  if (!apiKey) return json({ error: 'Sara is not configured — set AI_API_KEY' }, 503)
  const apiBase = Deno.env.get('AI_API_BASE') ?? 'https://api.moonshot.ai/v1'
  const model = Deno.env.get('AI_MODEL') ?? 'kimi-k2-0711-preview'

  let messages: { role: string; content: string }[]
  try {
    ;({ messages } = await req.json())
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    return json({ error: 'messages required' }, 400)
  }
  const trimmed = messages
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-MAX_TURNS)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }))

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const credits = await checkAiCredits(sb, auth.userId)
  if (!credits.allowed) {
    return json(
      { error: `AI credits used up for this month (${credits.used}/${credits.cap}).`, usage: credits },
      429,
    )
  }

  const [caller, businessId] = await Promise.all([
    loadCaller(sb, auth.userId),
    callerBusinessId(sb, auth.userId),
  ])
  const snapshot = await buildSnapshot(sb, businessId)

  const system = `You are Sara, the sharp, warm operations assistant for this
custom-interiors business. You are talking with:
  ${caller.name} — ${caller.jobRole}
  Responsibilities: ${caller.responsibilities}
Team:
${caller.teamDirectory}

Below is a live snapshot of the business (open jobs with notes and their
authors, next 7 days of appointments, overdue invoices, open tasks). Answer
questions from it: what to do today, who's going quiet, job status, money
outstanding, who on the team should handle something. Ground every answer in
the data — reference job numbers (EI-…) and real names, never invent
anything. If asked something the snapshot can't answer (old closed jobs,
document contents), say so and point to where in the app to look. Respect
the person's role: keep recommendations in their lane and route other-lane
items to the right teammate by name. Be concise — short paragraphs or tight
bullet lists, no headers. You cannot take actions yourself; when an action
is needed, tell them exactly what to do (e.g. "add a task", "open EI-2026-
0004 and call from the thread").

SNAPSHOT:
${JSON.stringify(snapshot)}`

  const llmRes = await fetch(`${apiBase}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: system }, ...trimmed],
    }),
  })
  const llmBody = await llmRes.json()
  if (!llmRes.ok) {
    return json({ error: `Sara's model (${model}): ${llmBody?.error?.message ?? llmRes.status}` }, 502)
  }

  await logAiUsage(
    sb, auth.userId, 'sara-chat', model,
    llmBody.usage?.prompt_tokens ?? null, llmBody.usage?.completion_tokens ?? null,
  )

  return json({
    reply: llmBody.choices[0].message.content,
    usage: { used: credits.used + 1, cap: credits.cap },
  })
})
