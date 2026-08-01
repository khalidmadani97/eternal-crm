// Sara — conversational assistant (Slices 34/36). Multi-turn chat over the
// live business snapshot, role-aware, credit-metered. She has exactly ONE
// write ability: creating tasks on the calendar — guarded on both sides
// (prompted to be conservative with people's time; server caps 3 per
// message, validates assignees against the team, clamps due dates).

import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { checkAiCredits, json, logAiUsage, requireStaff } from '../_shared/twilio.ts'
import { buildSnapshot, callerBusinessId, loadCaller } from '../_shared/sara.ts'

const MAX_TURNS = 14
const MAX_TASKS_PER_MESSAGE = 3

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'create_task',
      description:
        'Create ONE task on the company calendar. Use only when the user asks for it or clearly agrees. Be conservative with people\'s time: the fewest tasks possible, realistic due dates, never pile onto someone already loaded (see task_load_next_7_days), and time-box TIGHTLY via estimated_minutes — a follow-up call is 10-15 min, a quote review 20-30, a site visit 60. Never pad.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Short imperative task title' },
          due_date: { type: 'string', description: 'YYYY-MM-DD, today or later' },
          assignee_name: {
            type: 'string',
            description: 'Team member full name from the directory; omit to assign the person you are talking to',
          },
          job_number: { type: 'string', description: 'Related job number (EI-…) if any' },
          estimated_minutes: {
            type: 'integer',
            description: 'Tight time budget in minutes (5-120). Default 15. Do not pad.',
          },
          description: {
            type: 'string',
            description: 'Optional 1-3 sentence instructions: context, what good looks like, key numbers',
          },
        },
        required: ['title', 'due_date'],
      },
    },
  },
]

interface CreatedTask {
  title: string
  due_date: string
  assignee: string
  job_number: string | null
  estimated_minutes: number
}

async function executeCreateTask(
  sb: SupabaseClient,
  businessId: string,
  callerUserId: string,
  args: {
    title?: string
    due_date?: string
    assignee_name?: string
    job_number?: string
    estimated_minutes?: number
    description?: string
  },
): Promise<{ ok: boolean; result: string; created?: CreatedTask }> {
  const title = (args.title ?? '').trim()
  if (!title) return { ok: false, result: 'title is required' }

  const today = new Date().toISOString().slice(0, 10)
  const max = new Date(Date.now() + 60 * 86400_000).toISOString().slice(0, 10)
  let due = args.due_date ?? today
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return { ok: false, result: 'due_date must be YYYY-MM-DD' }
  if (due < today) due = today
  if (due > max) return { ok: false, result: 'due_date too far out (max 60 days)' }

  let assignedTo = callerUserId
  let assigneeName = 'you'
  if (args.assignee_name?.trim()) {
    const { data: members } = await sb
      .from('business_members')
      .select('user_id, profile:profiles!business_members_user_id_fkey ( id, full_name )')
      .eq('business_id', businessId)
      .eq('status', 'active')
    const match = (members as unknown as { user_id: string; profile: { full_name: string | null } | null }[] | null)?.find(
      (m) => m.profile?.full_name?.toLowerCase() === args.assignee_name!.trim().toLowerCase(),
    )
    if (!match) return { ok: false, result: `no active team member named "${args.assignee_name}"` }
    assignedTo = match.user_id
    assigneeName = match.profile?.full_name ?? args.assignee_name
  }

  let jobId: string | null = null
  let jobNumber: string | null = null
  if (args.job_number?.trim()) {
    const { data: job } = await sb
      .from('jobs')
      .select('id, job_number')
      .eq('business_id', businessId)
      .eq('job_number', args.job_number.trim())
      .maybeSingle()
    if (job) {
      jobId = job.id
      jobNumber = job.job_number
    }
  }

  // Time is precious: clamp to a tight window, default 15 minutes.
  const minutes = Math.min(120, Math.max(5, Math.round(Number(args.estimated_minutes) || 15)))

  const { error } = await sb.from('tasks').insert({
    business_id: businessId,
    title,
    due_date: due,
    assigned_to: assignedTo,
    job_id: jobId,
    estimated_minutes: minutes,
    description: args.description?.trim().slice(0, 600) || null,
  })
  if (error) return { ok: false, result: error.message }
  return {
    ok: true,
    result: `created: "${title}" due ${due} (${minutes} min) for ${assigneeName}${jobNumber ? ` on ${jobNumber}` : ''}`,
    created: { title, due_date: due, assignee: assigneeName, job_number: jobNumber, estimated_minutes: minutes },
  }
}

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
  if (!businessId) return json({ error: 'No active business' }, 400)
  const snapshot = await buildSnapshot(sb, businessId)

  const system = `You are Sara, the sharp, warm operations assistant for this
custom-interiors business. You are talking with:
  ${caller.name} — ${caller.jobRole}
  Responsibilities: ${caller.responsibilities}
Team:
${caller.teamDirectory}

Below is a live snapshot of the business (open jobs with notes and their
authors, next 7 days of appointments, overdue invoices, open tasks, and
task_load_next_7_days per person). Answer questions from it: what to do
today, who's going quiet, job status, money outstanding. Ground every
answer in the data — reference job numbers (EI-…) and real names, never
invent anything. Respect the person's role: keep recommendations in their
lane and route other-lane items to the right teammate by name. Be concise.

You have ONE ability beyond talking: create_task puts a task on the
calendar. Use it ONLY when the user asks or clearly agrees. BE CONSERVATIVE
WITH PEOPLE'S TIME: create the fewest tasks that cover the need (usually
one), pick realistic due dates, spread work across the week, time-box every task tightly
(estimated_minutes — never pad; most tasks are 15 minutes), and check
task_load_next_7_days before adding to someone's plate — if they're loaded,
suggest another day or another teammate instead. Never create more than
${MAX_TASKS_PER_MESSAGE} tasks in one go. After creating, confirm plainly
what you scheduled. For anything else you cannot do, say where to click.

SNAPSHOT:
${JSON.stringify(snapshot)}`

  // Tool loop: at most 2 model rounds (one tool round + one final answer).
  const chatMessages: Record<string, unknown>[] = [
    { role: 'system', content: system },
    ...trimmed,
  ]
  const createdTasks: CreatedTask[] = []
  let reply = ''

  for (let round = 0; round < 2; round++) {
    const llmRes = await fetch(`${apiBase}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: chatMessages, tools: TOOLS }),
    })
    const llmBody = await llmRes.json()
    if (!llmRes.ok) {
      return json({ error: `Sara's model (${model}): ${llmBody?.error?.message ?? llmRes.status}` }, 502)
    }
    await logAiUsage(
      sb, auth.userId, 'sara-chat', model,
      llmBody.usage?.prompt_tokens ?? null, llmBody.usage?.completion_tokens ?? null,
    )
    const choice = llmBody.choices[0]
    const toolCalls = choice.message.tool_calls as
      | { id: string; function: { name: string; arguments: string } }[]
      | undefined

    if (!toolCalls?.length || round === 1) {
      reply = choice.message.content ?? ''
      break
    }

    chatMessages.push(choice.message)
    for (const call of toolCalls.slice(0, MAX_TASKS_PER_MESSAGE)) {
      let outcome = { ok: false, result: 'unknown tool' } as Awaited<ReturnType<typeof executeCreateTask>>
      if (call.function.name === 'create_task' && createdTasks.length < MAX_TASKS_PER_MESSAGE) {
        let args = {}
        try {
          args = JSON.parse(call.function.arguments)
        } catch {
          outcome = { ok: false, result: 'invalid arguments' }
        }
        outcome = await executeCreateTask(sb, businessId, auth.userId, args)
        if (outcome.ok && outcome.created) createdTasks.push(outcome.created)
      } else if (createdTasks.length >= MAX_TASKS_PER_MESSAGE) {
        outcome = { ok: false, result: `limit of ${MAX_TASKS_PER_MESSAGE} tasks per message reached` }
      }
      chatMessages.push({ role: 'tool', tool_call_id: call.id, content: outcome.result })
    }
  }

  return json({
    reply: reply || (createdTasks.length ? 'Done — task added to the calendar.' : ''),
    createdTasks,
    usage: { used: credits.used + 1, cap: credits.cap },
  })
})
