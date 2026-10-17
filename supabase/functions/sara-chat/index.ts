// Sara — conversational assistant (Slices 34/36). Multi-turn chat over the
// live business snapshot, role-aware, credit-metered. Write abilities:
//   create_lead  — enter a new lead directly from pasted info
//   create_task  — put a task on the calendar (capped at 3/msg)
// Guarded on both sides: prompted carefully, server validates.

import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { CORS_HEADERS, checkAiCredits, json, logAiUsage, requireStaff } from '../_shared/twilio.ts'
import { buildSnapshot, callerBusinessId, loadCaller } from '../_shared/sara.ts'

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  if (digits.length >= 7) return `+${digits}`
  return null
}

const MAX_TURNS = 14
const MAX_TASKS_PER_MESSAGE = 3
const MAX_LEADS_PER_MESSAGE = 5
const MAX_BULK_ROWS = 500

const CREATE_LEAD_TOOL = {
  type: 'function',
  function: {
    name: 'create_lead',
    description:
      'Enter a new lead into the CRM from info the user has given or pasted. ' +
      'ALWAYS call this when the user shares a name, phone, city, or email from a Google/Meta lead or any other source. ' +
      'Never create a task to "enter the lead later" — enter it now with this tool. ' +
      'Extract every field you can see: name, phone, email, city, message/job description, source. ' +
      'Copy city/location names EXACTLY as written — never autocomplete, correct spelling, or substitute a place name ' +
      '(e.g. "White Lake" must stay "White Lake", never "Whitby" or any other city). ' +
      'The contact is stored as "New Lead" until a rep qualifies it; the real name is recorded separately on the lead card.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Full name from the lead' },
        phone: { type: 'string', description: 'Phone number (any format — will be normalised to E.164)' },
        email: { type: 'string', description: 'Email address' },
        city: { type: 'string', description: 'City or neighbourhood — copy EXACTLY as written, no spelling corrections or substitutions' },
        message: { type: 'string', description: 'Lead message, job description, or notes' },
        lead_source: { type: 'string', description: 'Where this lead came from (e.g. Google Ads, Meta, website, referral)' },
        pipeline_name: { type: 'string', description: 'Pipeline to add to — omit for the default pipeline' },
        assignee_name: { type: 'string', description: 'Team member full name to assign the lead to — omit to leave unassigned' },
      },
      required: [],
    },
  },
}

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
  CREATE_LEAD_TOOL,
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

interface CreatedLead {
  job_id: string
  job_number: string
  title: string
  name: string | null
  phone: string | null
}

async function executeCreateLead(
  sb: SupabaseClient,
  businessId: string,
  args: {
    name?: string
    phone?: string
    email?: string
    city?: string
    message?: string
    lead_source?: string
    pipeline_name?: string
    assignee_name?: string
  },
): Promise<{ ok: boolean; result: string; created?: CreatedLead }> {
  const name = args.name?.trim() || null
  const city = args.city?.trim() || null
  const phone = args.phone?.trim() ? normalizePhone(args.phone.trim()) : null
  const email = args.email?.trim() || null
  const message = args.message?.trim() || null
  const lead_source = args.lead_source?.trim() || null

  // Resolve optional pipeline
  let pipelineId: string | null = null
  if (args.pipeline_name?.trim()) {
    const { data: pipe } = await sb
      .from('pipelines')
      .select('id')
      .eq('business_id', businessId)
      .ilike('name', args.pipeline_name.trim())
      .maybeSingle()
    if (pipe) pipelineId = pipe.id
  }

  // Resolve optional assignee
  let assignedTo: string | null = null
  if (args.assignee_name?.trim()) {
    const { data: members } = await sb
      .from('business_members')
      .select('user_id, profile:profiles!business_members_user_id_fkey ( full_name )')
      .eq('business_id', businessId)
      .eq('status', 'active')
    const match = (
      members as unknown as { user_id: string; profile: { full_name: string | null } | null }[] | null
    )?.find((m) => m.profile?.full_name?.toLowerCase() === args.assignee_name!.trim().toLowerCase())
    if (match) assignedTo = match.user_id
  }

  // Try to match existing contact by phone or email before creating a new one.
  let contactId: string | null = null
  if (phone || email) {
    let query = sb.from('contacts').select('id, full_name, phone, email, city').eq('business_id', businessId)
    if (phone) query = query.eq('phone', phone)
    else if (email) query = query.ilike('email', email)
    const { data: existing } = await query.maybeSingle()
    if (existing) {
      contactId = existing.id
      const patch: Record<string, string | null> = {}
      if ((!existing.full_name || existing.full_name === 'New Lead' || existing.full_name === 'Unknown') && name) patch.full_name = name
      if (!existing.email && email) patch.email = email
      if (!existing.city && city) patch.city = city
      if (Object.keys(patch).length) await sb.from('contacts').update(patch).eq('id', contactId)
    }
  }
  if (!contactId) {
    const { data: contact, error: contactErr } = await sb
      .from('contacts')
      .insert({
        business_id: businessId,
        full_name: name || 'Unknown',
        phone,
        email,
        city,
        lead_source,
        confirmed: true,
      })
      .select('id')
      .single()
    if (contactErr || !contact) return { ok: false, result: contactErr?.message ?? 'failed to create contact' }
    contactId = contact.id
  }

  // Allocate job number
  const { data: jobNumber, error: numErr } = await sb.rpc('next_document_number_for', {
    p_business: businessId,
    p_prefix: 'EI',
  })
  if (numErr || !jobNumber) return { ok: false, result: numErr?.message ?? 'failed to allocate job number' }

  const titleParts = [name, city].filter(Boolean)
  const title = titleParts.length > 0 ? titleParts.join(' - ') : 'New Lead'

  const { data: job, error: jobErr } = await sb
    .from('jobs')
    .insert({
      business_id: businessId,
      contact_id: contactId,
      job_number: jobNumber as string,
      title,
      stage: 'new',
      lead_source,
      city,
      assigned_to: assignedTo,
      pipeline_id: pipelineId,
    })
    .select('id')
    .single()
  if (jobErr || !job) return { ok: false, result: jobErr?.message ?? 'failed to create job' }

  // Log in inbound_leads so the lead card shows origin info and parsed name/phone
  const rawPayload: Record<string, string> = {}
  if (name) rawPayload['names'] = name
  if (phone) rawPayload['phone'] = phone
  if (email) rawPayload['email'] = email
  if (city) rawPayload['city'] = city
  if (message) rawPayload['message'] = message
  if (lead_source) rawPayload['source'] = lead_source

  await sb.from('inbound_leads').insert({
    business_id: businessId,
    job_id: job.id,
    contact_id: contactId,
    provider: 'manual',
    raw_payload: rawPayload,
    parsed_name: name,
    parsed_phone: phone,
    parsed_email: email,
    parsed_message: message,
    converted_at: new Date().toISOString(),
  })

  // Activity note so the pasted message shows in the timeline
  if (message) {
    await sb.from('activities').insert({
      business_id: businessId,
      job_id: job.id,
      contact_id: contactId,
      kind: 'note',
      body: `Lead form details:\n${message.slice(0, 1500)}`,
    })
  }

  const summary = [name, phone, city].filter(Boolean).join(' · ')
  return {
    ok: true,
    result: `created ${jobNumber} "${title}"${summary ? ` (${summary})` : ''}`,
    created: { job_id: job.id, job_number: jobNumber as string, title, name, phone },
  }
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
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS })
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

Below is a live snapshot of the business. owner_quick_notes are scratchpad
notes written by the owner — READ THESE FIRST before answering any question.
Each is a standing directive or reminder; if the user asks "what should I do"
or "what's important", these come first. flagged_recent_notes are recent
HUMAN-written job/contact notes: treat explicit instructions and dates in them
as commitments — a note saying to do something today/on a date MUST appear in
any "what should I do" answer for that day, at the top. Ground every answer in
the data — reference job numbers (EI-…) and real names, never invent anything.
Respect the person's role: keep recommendations in their lane and route
other-lane items to the right teammate by name. Be concise.

Stage directory (KEY ("label", phase)): ${stageDirectory}
Pipelines: ${pipelineNames}

── CRM CONTEXT ──────────────────────────────────────────────────────────────
This is a custom-interiors CRM (Eternal Interiors). Key facts you must know:

LEAD WORKFLOW: new → contacted → quoted → follow_up → won (moves to Jobs) → lost.
Jobs in the "won" stage and beyond are production jobs (templated → fabrication →
scheduled → installed → closed). Pipeline leads live in the Lead board;
production jobs live in the Jobs board.

CONTACTS: When a lead first comes in, the contact is created as "New Lead" —
this is intentional. The real name is recorded on the lead card (in inbound_leads)
and shown on the lead detail page. The sales rep qualifies the lead and fills in
the real contact details. Never invent contact details.

LEAD ENTRY RULE: When the user shares or pastes any lead info (name, phone, city,
email, message from Google Ads, Meta, or any source) — USE create_lead TO ENTER
IT IMMEDIATELY. Do NOT create a task saying "enter this lead" or "add to CRM". You
have the tool; use it. Extract every field you can see from the pasted text.

── YOUR WRITE ABILITIES ─────────────────────────────────────────────────────
• create_lead — enter a new lead from pasted info. Use this the moment the user
  gives you any lead data. Extracts name/phone/city/email/message/source and creates
  the lead in the pipeline as "New Lead" with the real name stored on the lead card.
  Never create a task instead of doing this.

• create_task — put a task on the calendar. Use ONLY when the user asks or clearly
  agrees. BE CONSERVATIVE WITH PEOPLE'S TIME: create the fewest tasks needed (usually
  one), realistic due dates, time-box tightly (most tasks = 15 min), and check
  task_load_next_7_days before adding to someone's plate. Max ${MAX_TASKS_PER_MESSAGE}
  tasks per message.${isAdmin ? `

• move_leads / assign_leads (ADMIN only) — bulk stage moves or assignments.
  Because ${caller.name} is an ADMIN you have these for bulk changes ("move all
  follow-ups older than 30 days to lost", "give Omar every unassigned new lead").
  CALL IMMEDIATELY when asked — calling only stages the action; nothing changes
  until the user types the confirm phrase on the card. The card IS the permission step.
  Use stage KEYS from the directory.` : ''}

For anything else you cannot do, say where to click in the CRM.
─────────────────────────────────────────────────────────────────────────────

SNAPSHOT:
${JSON.stringify(snapshot)}`

  // Tool loop: at most 2 model rounds (one tool round + one final answer).
  const chatMessages: Record<string, unknown>[] = [
    { role: 'system', content: system },
    ...trimmed,
  ]
  const createdTasks: CreatedTask[] = []
  const createdLeads: CreatedLead[] = []
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
      if (call.function.name === 'create_lead') {
        if (createdLeads.length >= MAX_LEADS_PER_MESSAGE) {
          resultText = `limit of ${MAX_LEADS_PER_MESSAGE} leads per message reached`
        } else {
          const outcome = await executeCreateLead(sb, businessId, args)
          if (outcome.ok && outcome.created) createdLeads.push(outcome.created)
          resultText = outcome.result
        }
      } else if (call.function.name === 'create_task') {
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
    reply: reply || (createdLeads.length ? `Done — ${createdLeads.length === 1 ? `lead ${createdLeads[0].job_number} added.` : `${createdLeads.length} leads added.`}` : createdTasks.length ? 'Done — task added to the calendar.' : ''),
    createdTasks,
    createdLeads,
    stagedActions,
    toolTrace,
    usage: { used: credits.used + 1, cap: credits.cap },
  })
  } catch (e) {
    return json({ error: `Sara hit a snag: ${e instanceof Error ? e.message : e}` }, 500)
  }
})
