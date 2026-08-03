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
const MAX_BULK_ROWS = 500

const ADMIN_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'move_leads',
      description:
        'ADMIN ONLY. STAGE (not execute) a bulk move of leads between stages. You can never execute changes: calling this creates a pending action; the user sees a confirmation card and must type the confirm phrase and press Execute themselves. Relay the preview and tell them to use the card.',
      parameters: {
        type: 'object',
        properties: {
          from_stages: {
            type: 'array',
            items: { type: 'string' },
            description: 'Stage KEYS to move from (see the stage directory)',
          },
          to_stage: { type: 'string', description: 'Target stage KEY' },
          pipeline_name: { type: 'string', description: 'Limit to one pipeline by name' },
          assignee_name: { type: 'string', description: 'Limit to leads owned by this person' },
          lead_source: { type: 'string', description: 'Limit by lead source' },
          min_days_since_contact: { type: 'integer', description: 'Only leads untouched for ≥ N days' },
          lost_reason: { type: 'string', description: 'Required when to_stage is lost' },
        },
        required: ['from_stages', 'to_stage'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'assign_leads',
      description:
        'ADMIN ONLY. STAGE (not execute) a bulk assignment of leads to a team member. Creates a pending action the user must confirm via the card — you cannot execute anything.',
      parameters: {
        type: 'object',
        properties: {
          assignee_name: { type: 'string', description: 'Team member to assign to (full name)' },
          stages: { type: 'array', items: { type: 'string' }, description: 'Limit to these stage keys' },
          pipeline_name: { type: 'string' },
          lead_source: { type: 'string' },
          only_unassigned: { type: 'boolean' },
        },
        required: ['assignee_name'],
      },
    },
  },
]

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

interface BulkFilters {
  stages?: string[]
  pipeline_name?: string
  assignee_name?: string
  lead_source?: string
  min_days_since_contact?: number
  only_unassigned?: boolean
}

async function selectBulkTargets(
  sb: SupabaseClient,
  businessId: string,
  f: BulkFilters,
): Promise<{ id: string; job_number: string; title: string; stage: string }[] | string> {
  let q = sb
    .from('jobs')
    .select('id, job_number, title, stage, contact:contacts ( last_contacted_at )')
    .eq('business_id', businessId)
    .is('deleted_at', null)
    .limit(MAX_BULK_ROWS + 1)
  if (f.stages?.length) q = q.in('stage', f.stages)
  if (f.pipeline_name) {
    const { data: pipe } = await sb
      .from('pipelines').select('id, position')
      .eq('business_id', businessId).ilike('name', f.pipeline_name).maybeSingle()
    if (!pipe) return `no pipeline named "${f.pipeline_name}"`
    // default (first) pipeline also owns legacy null rows
    const { data: first } = await sb
      .from('pipelines').select('id').eq('business_id', businessId)
      .order('position').limit(1).single()
    q = first?.id === pipe.id
      ? q.or(`pipeline_id.eq.${pipe.id},pipeline_id.is.null`)
      : q.eq('pipeline_id', pipe.id)
  }
  if (f.lead_source) q = q.ilike('lead_source', f.lead_source)
  if (f.only_unassigned) q = q.is('assigned_to', null)
  if (f.assignee_name) {
    const { data: prof } = await sb
      .from('profiles').select('id').ilike('full_name', f.assignee_name).maybeSingle()
    if (!prof) return `no team member named "${f.assignee_name}"`
    q = q.eq('assigned_to', prof.id)
  }
  const { data, error } = await q
  if (error) return error.message
  let rows = (data ?? []) as unknown as {
    id: string; job_number: string; title: string; stage: string
    contact: { last_contacted_at: string | null } | null
  }[]
  if (f.min_days_since_contact) {
    const cutoff = Date.now() - f.min_days_since_contact * 86400_000
    rows = rows.filter(
      (r) => !r.contact?.last_contacted_at || new Date(r.contact.last_contacted_at).getTime() < cutoff,
    )
  }
  if (rows.length > MAX_BULK_ROWS) return `too many rows (>${MAX_BULK_ROWS}) — narrow the filters`
  return rows.map(({ id, job_number, title, stage }) => ({ id, job_number, title, stage }))
}

export interface StagedAction {
  id: string
  kind: string
  summary: string
  count: number
  confirm_phrase: string
  sample: string[]
}

async function stagePendingAction(
  sb: SupabaseClient,
  businessId: string,
  userId: string,
  kind: 'move_leads' | 'assign_leads',
  summary: string,
  phraseWord: string,
  patch: Record<string, string | null>,
  rows: { id: string; job_number: string; title: string; stage: string }[],
  prevOf: (row: { id: string; stage: string }) => Record<string, string | null>,
): Promise<{ text: string; staged: StagedAction }> {
  const confirm_phrase = `${phraseWord} ${rows.length}`
  const targets = rows.map((r) => ({ id: r.id, prev: prevOf(r) }))
  const { data, error } = await sb
    .from('pending_actions')
    .insert({
      business_id: businessId,
      requested_by: userId,
      kind,
      summary,
      confirm_phrase,
      patch,
      targets,
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  const sample = rows.slice(0, 6).map((r) => `${r.job_number} "${r.title}"`)
  return {
    text: `STAGED (nothing changed yet): ${summary} — ${rows.length} lead(s), e.g. ${sample.join('; ')}. A confirmation card is now shown to the user; they must type "${confirm_phrase}" and press Execute. Tell them exactly that.`,
    staged: { id: data.id, kind, summary, count: rows.length, confirm_phrase, sample },
  }
}

async function executeMoveLeads(
  sb: SupabaseClient,
  businessId: string,
  userId: string,
  validStages: Set<string>,
  args: BulkFilters & { from_stages?: string[]; to_stage?: string; lost_reason?: string },
): Promise<{ text: string; staged?: StagedAction }> {
  const from = (args.from_stages ?? []).filter((s) => validStages.has(s))
  if (!from.length) return { text: 'from_stages must contain valid stage keys' }
  if (!args.to_stage || !validStages.has(args.to_stage)) return { text: `invalid to_stage "${args.to_stage}"` }
  if (args.to_stage === 'lost' && !args.lost_reason?.trim()) {
    return { text: 'moving to lost requires lost_reason — ask the user why' }
  }
  const rows = await selectBulkTargets(sb, businessId, { ...args, stages: from })
  if (typeof rows === 'string') return { text: rows }
  if (rows.length === 0) return { text: 'no leads match those filters' }
  const patch: Record<string, string | null> = { stage: args.to_stage }
  if (args.to_stage === 'lost') patch.lost_reason = args.lost_reason!.trim()
  return await stagePendingAction(
    sb, businessId, userId, 'move_leads',
    `Move ${rows.length} lead(s) [${from.join(', ')}] → ${args.to_stage}`,
    'MOVE', patch, rows,
    (r) => ({ stage: r.stage }),
  )
}

async function executeAssignLeads(
  sb: SupabaseClient,
  businessId: string,
  userId: string,
  args: BulkFilters & { assignee_name?: string },
): Promise<{ text: string; staged?: StagedAction }> {
  if (!args.assignee_name?.trim()) return { text: 'assignee_name required' }
  const { data: members } = await sb
    .from('business_members')
    .select('user_id, profile:profiles!business_members_user_id_fkey ( full_name )')
    .eq('business_id', businessId).eq('status', 'active')
  const match = (members as unknown as { user_id: string; profile: { full_name: string | null } | null }[] | null)?.find(
    (m) => m.profile?.full_name?.toLowerCase() === args.assignee_name!.trim().toLowerCase(),
  )
  if (!match) return { text: `no active team member named "${args.assignee_name}"` }
  const rows = await selectBulkTargets(sb, businessId, { ...args, assignee_name: undefined })
  if (typeof rows === 'string') return { text: rows }
  if (rows.length === 0) return { text: 'no leads match those filters' }
  // fetch current assignments for undo
  const { data: current } = await sb
    .from('jobs').select('id, assigned_to').in('id', rows.map((r) => r.id))
  const prevMap = new Map((current ?? []).map((c) => [c.id, c.assigned_to as string | null]))
  return await stagePendingAction(
    sb, businessId, userId, 'assign_leads',
    `Assign ${rows.length} lead(s) to ${match.profile?.full_name}`,
    'ASSIGN', { assigned_to: match.user_id }, rows,
    (r) => ({ assigned_to: prevMap.get(r.id) ?? null }),
  )
}

Deno.serve(async (req) => {
  try {
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

  // Admin? (business admin or platform admin) → bulk tools become available.
  const [{ data: meProfile }, { data: myMembership }] = await Promise.all([
    sb.from('profiles').select('platform_admin').eq('id', auth.userId).single(),
    sb.from('business_members').select('role')
      .eq('business_id', businessId).eq('user_id', auth.userId)
      .eq('status', 'active').maybeSingle(),
  ])
  const isAdmin = !!meProfile?.platform_admin || myMembership?.role === 'admin'

  // Stage + pipeline directory so she uses real keys/names.
  const [{ data: stageDir }, { data: pipelineDir }] = await Promise.all([
    sb.from('stage_settings')
      .select('stage, label, phase, hidden, pipeline_id')
      .eq('business_id', businessId),
    sb.from('pipelines').select('name').eq('business_id', businessId).order('position'),
  ])
  const validStages = new Set((stageDir ?? []).map((s) => s.stage as string))
  const stageDirectory = (stageDir ?? [])
    .filter((s) => !s.hidden)
    .map((s) => `${s.stage} ("${s.label}", ${s.phase})`)
    .join(', ')
  const pipelineNames = (pipelineDir ?? []).map((p) => p.name).join(', ')

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
invent anything. flagged_recent_notes are recent HUMAN-written notes:
treat explicit instructions and dates in them as commitments — a note
saying to do something today/on a date MUST appear in any "what should I
do" answer for that day, at the top. Respect the person's role: keep recommendations in their
lane and route other-lane items to the right teammate by name. Be concise.

Stage directory (KEY ("label", phase)): ${stageDirectory}
Pipelines: ${pipelineNames}

Your abilities beyond talking: create_task puts a task on the
calendar.${isAdmin ? `

Because ${caller.name} is an ADMIN you also have move_leads and
assign_leads for bulk changes ("move all follow-ups older than 30 days to
lost", "give Omar every unassigned new lead"). When the admin asks for a
bulk change, CALL THE TOOL IMMEDIATELY — do NOT ask permission first.
Calling it is completely safe: it changes NOTHING and only produces the
confirmation card (with exact count and a typed confirm phrase) that the
user must complete themselves; they can also Undo for 24h after executing.
The card IS the permission step — asking "shall I?" before calling is
wrong and annoying. After calling, relay the exact count from the tool
result and tell them to use the card. Use stage KEYS from the directory.` : ''} Use it ONLY when the user asks or clearly agrees. BE CONSERVATIVE
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
  const stagedActions: StagedAction[] = []
  const toolTrace: { tool: string; result: string }[] = []
  let reply = ''

  for (let round = 0; round < 2; round++) {
    const llmRes = await fetch(`${apiBase}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: chatMessages, tools: isAdmin ? [...TOOLS, ...ADMIN_TOOLS] : TOOLS }),
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
    for (const call of toolCalls.slice(0, 4)) {
      let args: Record<string, unknown> = {}
      try {
        args = JSON.parse(call.function.arguments)
      } catch {
        chatMessages.push({ role: 'tool', tool_call_id: call.id, content: 'invalid arguments' })
        continue
      }
      let resultText = 'unknown tool'
      try {
      if (call.function.name === 'create_task') {
        if (createdTasks.length >= MAX_TASKS_PER_MESSAGE) {
          resultText = `limit of ${MAX_TASKS_PER_MESSAGE} tasks per message reached`
        } else {
          const outcome = await executeCreateTask(sb, businessId, auth.userId, args)
          if (outcome.ok && outcome.created) createdTasks.push(outcome.created)
          resultText = outcome.result
        }
      } else if (call.function.name === 'move_leads') {
        if (!isAdmin) resultText = 'admin only — not permitted for this user'
        else {
          const r = await executeMoveLeads(sb, businessId, auth.userId, validStages, args as never)
          resultText = r.text
          if (r.staged) stagedActions.push(r.staged)
        }
      } else if (call.function.name === 'assign_leads') {
        if (!isAdmin) resultText = 'admin only — not permitted for this user'
        else {
          const r = await executeAssignLeads(sb, businessId, auth.userId, args as never)
          resultText = r.text
          if (r.staged) stagedActions.push(r.staged)
        }
      }
      } catch (e) {
        resultText = `tool failed: ${e instanceof Error ? e.message : e}`
      }
      toolTrace.push({ tool: call.function.name, result: resultText.slice(0, 300) })
      chatMessages.push({ role: 'tool', tool_call_id: call.id, content: resultText })
    }
  }

  return json({
    reply: reply || (createdTasks.length ? 'Done — task added to the calendar.' : ''),
    createdTasks,
    stagedActions,
    toolTrace,
    usage: { used: credits.used + 1, cap: credits.cap },
  })
  } catch (e) {
    return json({ error: `Sara hit a snag: ${e instanceof Error ? e.message : e}` }, 500)
  }
})
