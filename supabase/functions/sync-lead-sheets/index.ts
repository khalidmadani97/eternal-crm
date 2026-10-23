// Live lead-sheet ingestion (Slice 39, DECISIONS 033). Meta Lead Ads and
// Google Forms both export to Google Sheets; point the pipeline at the
// sheet (shared "anyone with link can view") and rows become leads.
//
//   POST {action:'sync'}                    → sync every active sheet of the
//                                             caller's business
//   POST {action:'sync', sheetId}           → sync one sheet
//   POST {action:'preview', sheetUrl}       → fetch headers + mapping dry-run
//
// Foolproof by design: the raw row is stored in inbound_leads FIRST; a
// row-hash dedupe key makes re-syncs idempotent; column mapping is done
// once by the AI (heuristics as fallback) and cached on the sheet.

import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { CORS_HEADERS, json, requireStaff } from '../_shared/twilio.ts'

// ── CSV / URL helpers ────────────────────────────────────────────────────────

function toCsvUrl(sheetUrl: string): string | null {
  const url = sheetUrl.trim()
  if (/output=csv/.test(url)) return url
  const m = /docs\.google\.com\/spreadsheets\/d\/(?:e\/)?([\w-]+)/.exec(url)
  if (!m) return /^https?:\/\/.+\.csv(\?.*)?$/.test(url) ? url : null
  const gid = /[#&?]gid=(\d+)/.exec(url)?.[1] ?? '0'
  if (url.includes('/d/e/')) return `https://docs.google.com/spreadsheets/d/e/${m[1]}/pub?output=csv&gid=${gid}`
  return `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv&gid=${gid}`
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') inQuotes = false
      else field += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some((f) => f.trim() !== '')) rows.push(row)
      row = []
    } else field += c
  }
  if (field !== '' || row.length) {
    row.push(field)
    if (row.some((f) => f.trim() !== '')) rows.push(row)
  }
  return rows
}

async function rowHash(cells: string[]): Promise<string> {
  const data = new TextEncoder().encode(cells.join(''))
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function normalizePhone(input: string): string | null {
  const digits = input.trim().replace(/[^\d+]/g, '')
  if (/^\+[1-9]\d{7,14}$/.test(digits)) return digits
  const bare = digits.replace(/\D/g, '')
  if (bare.length === 10) return `+1${bare}`
  if (bare.length === 11 && bare.startsWith('1')) return `+${bare}`
  return null
}

// ── Column mapping: AI first, heuristics as fallback ─────────────────────────

interface ColumnMap {
  name: number | null
  first_name: number | null  // separate first-name column if present
  last_name: number | null   // separate last-name column if present
  phone: number | null
  email: number | null
  city: number | null
  message: number | null
  /** Additional columns holding lead context (form questions, budgets,
   *  timelines…) — all captured into the lead's notes. */
  notes: number[]
  /** Column holding the lead's stage/status in the sheet, if any. */
  stage: number | null
  /** Cached mapping of raw sheet stage values → our stage keys. */
  stage_values?: Record<string, string>
  mapped_by: 'ai' | 'heuristic'
}

function heuristicMap(headers: string[]): ColumnMap {
  const find = (patterns: RegExp[]) => {
    const i = headers.findIndex((h) => patterns.some((p) => p.test(h.trim().toLowerCase())))
    return i === -1 ? null : i
  }
  // Patterns handle both full words and common short-form headers (p, n, e, c…)
  const name       = find([/full.?name/, /^names?$/, /^n$/, /^full$/, /contact/])
  const first_name = find([/^first.?name$/, /^first$/, /^fn$/, /^fname$/])
  const last_name  = find([/^last.?name$/, /^last$/, /^ln$/, /^lname$/, /^surname$/])
  const phone      = find([/phone/, /mobile/, /^p$/, /^ph$/, /^mob$/, /^cell$/, /tel/, /number/])
  const email      = find([/e.?mail/, /^e$/, /^em$/])
  const city       = find([/^city$/, /^c$/, /^location$/, /^loc$/, /^area$/, /^town$/, /^region$/])
  const message    = find([/message/, /notes?/, /comment/, /inquiry|enquiry/, /details?/, /describe|description/, /project/])
  const stage      = find([/stage/, /status/, /pipeline/])
  const META = /time|date|^id$|campaign|ad.?(set|name|id)|form|platform|source|created/
  const reserved = new Set([name, first_name, last_name, phone, email, city, message, stage].filter((v): v is number => v !== null))
  const notes = headers
    .map((h, i) => i)
    .filter((i) => !reserved.has(i) && headers[i].trim() !== '' && !META.test(headers[i].trim().toLowerCase()))
  return { name, first_name, last_name, phone, email, city, message, notes, stage, mapped_by: 'heuristic' }
}

/** Returns true if the mapped name column's sample values actually look like names. */
function nameColumnLooksValid(map: ColumnMap, sampleRows: string[][]): boolean {
  const nameIdx = map.name ?? map.first_name ?? map.last_name
  if (nameIdx === null) return true
  const phonePattern = /^\+?\d[\d\s\-().]{6,}$|^[a-z]{1,4}:\s*\+?\d/i
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  const values = sampleRows.map(r => (r[nameIdx] ?? '').trim()).filter(Boolean)
  if (!values.length) return true
  const badCount = values.filter(v => phonePattern.test(v) || emailPattern.test(v)).length
  return badCount < values.length // reject if every sample value is a phone/email
}

async function aiMap(headers: string[], samples: string[][]): Promise<ColumnMap | null> {
  const apiKey = Deno.env.get('AI_API_KEY')
  if (!apiKey) return null
  const apiBase = Deno.env.get('AI_API_BASE') ?? 'https://api.moonshot.ai/v1'
  const model = Deno.env.get('AI_MODEL') ?? 'kimi-k2-0711-preview'
  try {
    const res = await fetch(`${apiBase}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You map lead-form spreadsheet columns. Given headers (0-indexed) and sample rows, return JSON with these fields (all null/[] when absent):\n' +
              '  "name": index of a full-name column — headers like "name", "names", "full name", "contact name" all count (null if absent)\n' +
              '  "first_name": index of a first-name-only column (null if absent)\n' +
              '  "last_name": index of a last-name-only column (null if absent)\n' +
              '  "phone": index of phone/mobile number column — IMPORTANT: short headers like "p", "ph", "mob" are phone, NOT name\n' +
              '  "email": index of email column\n' +
              '  "city": index of city/location/area column (null if absent)\n' +
              '  "message": index of main free-text message/inquiry\n' +
              '  "stage": index of pipeline-stage/status column if present\n' +
              '  "notes": array of indexes of OTHER columns worth keeping as lead context (budget, timeline, service, address…)\n' +
              'EXCLUDE metadata columns (timestamps, IDs, campaign/ad/form names, platform). Use sample rows to disambiguate short headers.',
          },
          { role: 'user', content: JSON.stringify({ headers, samples }) },
        ],
      }),
    })
    const body = await res.json()
    if (!res.ok) return null
    const m = JSON.parse(body.choices[0].message.content)
    const idx = (v: unknown) =>
      typeof v === 'number' && v >= 0 && v < headers.length ? v : null
    const notes = Array.isArray(m.notes)
      ? [...new Set(m.notes.map(idx).filter((v: number | null): v is number => v !== null))]
      : []
    return {
      name: idx(m.name),
      first_name: idx(m.first_name),
      last_name: idx(m.last_name),
      phone: idx(m.phone),
      email: idx(m.email),
      city: idx(m.city),
      message: idx(m.message),
      stage: idx(m.stage),
      notes,
      mapped_by: 'ai',
    }
  } catch {
    return null
  }
}

async function aiMapStageValues(
  values: string[],
  stages: { stage: string; label: string }[],
): Promise<Record<string, string>> {
  const apiKey = Deno.env.get('AI_API_KEY')
  if (!apiKey) return {}
  const apiBase = Deno.env.get('AI_API_BASE') ?? 'https://api.moonshot.ai/v1'
  const model = Deno.env.get('AI_MODEL') ?? 'kimi-k2-0711-preview'
  try {
    const res = await fetch(`${apiBase}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'Map raw spreadsheet stage/status values to CRM pipeline stage KEYS. Given the available stages (key + label) and raw values, return JSON {"<raw value>":"<stage key>", ...}. Match by meaning ("booked estimate" → a quoting/estimate stage, "closed"/"sold" → won). BE CONSERVATIVE ABOUT LOST: map to a lost stage ONLY when the value unambiguously means the lead is dead ("lost", "dead", "not interested", "went elsewhere"). Ambiguous or stalled statuses ("missing info", "not qualified", "no answer", "cold") go to a follow-up-type stage instead — a lead marked lost disappears from the working pipeline. Omit values you cannot confidently map.',
          },
          { role: 'user', content: JSON.stringify({ stages, values }) },
        ],
      }),
    })
    const body = await res.json()
    if (!res.ok) return {}
    const parsed = JSON.parse(body.choices[0].message.content)
    return typeof parsed === 'object' && parsed ? parsed : {}
  } catch {
    return {}
  }
}

// ── Sync one sheet ───────────────────────────────────────────────────────────

interface SheetRow {
  id: string
  business_id: string
  name: string
  provider: string
  sheet_url: string
  column_map: ColumnMap | null
}

async function syncSheet(sb: SupabaseClient, sheet: SheetRow) {
  const csvUrl = toCsvUrl(sheet.sheet_url)
  if (!csvUrl) throw new Error('Not a recognizable Google Sheet / CSV link')
  const res = await fetch(csvUrl, { redirect: 'follow' })
  const text = await res.text()
  if (!res.ok || text.trimStart().startsWith('<')) {
    throw new Error(
      'Could not read the sheet — make sure link-sharing is on ("Anyone with the link can view")',
    )
  }
  const rows = parseCsv(text)
  if (rows.length < 2) return { imported: 0, total: 0 }
  const headers = rows[0]
  const dataRows = rows.slice(1)

  let map = sheet.column_map
  if (
    !map ||
    map.notes === undefined ||
    map.stage === undefined ||
    map.city === undefined ||
    // Name column missing or its values look like phones — force a remap
    (map.name === null && map.first_name === null && map.last_name === null) ||
    !nameColumnLooksValid(map, dataRows.slice(0, 3))
  ) {
    const aiResult = await aiMap(headers, dataRows.slice(0, 3))
    map = (aiResult && nameColumnLooksValid(aiResult, dataRows.slice(0, 3)))
      ? aiResult
      : heuristicMap(headers)
    await sb.from('lead_sheets').update({ column_map: map }).eq('id', sheet.id)
  }

  // Resolve the sheet's stage values against this business's stages.
  const { data: stageRows } = await sb
    .from('stage_settings')
    .select('stage, label')
    .eq('business_id', sheet.business_id)
  const stageByLabel = new Map<string, string>()
  for (const s of (stageRows ?? []) as { stage: string; label: string }[]) {
    stageByLabel.set(s.stage.toLowerCase(), s.stage)
    stageByLabel.set(s.label.toLowerCase(), s.stage)
  }
  const stageValues: Record<string, string> = { ...(map.stage_values ?? {}) }
  if (map.stage !== null) {
    const distinct = [
      ...new Set(
        dataRows
          .map((r) => (r[map.stage!] ?? '').trim().toLowerCase())
          .filter((v) => v && stageValues[v] === undefined),
      ),
    ]
    for (const v of distinct) {
      const direct = stageByLabel.get(v)
      if (direct) stageValues[v] = direct
    }
    const unresolved = distinct.filter((v) => stageValues[v] === undefined)
    if (unresolved.length) {
      const aiResolved = await aiMapStageValues(
        unresolved,
        (stageRows ?? []) as { stage: string; label: string }[],
      )
      for (const [raw, key] of Object.entries(aiResolved)) {
        if (stageByLabel.has(key.toLowerCase())) stageValues[raw] = stageByLabel.get(key.toLowerCase())!
      }
    }
    if (Object.keys(stageValues).length !== Object.keys(map.stage_values ?? {}).length) {
      map.stage_values = stageValues
      await sb.from('lead_sheets').update({ column_map: map }).eq('id', sheet.id)
    }
  }

  let imported = 0
  const newLeads: { name: string; title: string; stage: string }[] = []
  // Batch dedupe: one lookup for all keys instead of one query per row —
  // keeps big sheets far inside the function wall-clock limit.
  const keys = await Promise.all(dataRows.map(async (cells) => `${sheet.id}:${await rowHash(cells)}`))
  const existingKeys = new Set<string>()
  for (let i = 0; i < keys.length; i += 200) {
    const { data: existingRows } = await sb
      .from('inbound_leads')
      .select('dedupe_key')
      .eq('business_id', sheet.business_id)
      .in('dedupe_key', keys.slice(i, i + 200))
    for (const r of existingRows ?? []) existingKeys.add(r.dedupe_key as string)
  }
  for (let rowIndex = 0; rowIndex < dataRows.length; rowIndex++) {
    const cells = dataRows[rowIndex]
    const key = keys[rowIndex]
    // existing in DB, or an identical duplicate row earlier in this sheet
    if (existingKeys.has(key)) continue
    existingKeys.add(key)

    const cell = (i: number | null) => (i !== null && cells[i] !== undefined ? cells[i].trim() : '')
    const rawFirstName = cell(map.first_name)
    const rawLastName  = cell(map.last_name)
    // Prefer explicit full-name column; fall back to combining first + last
    const rawName = cell(map.name) ||
      (rawFirstName && rawLastName ? `${rawFirstName} ${rawLastName}` : rawFirstName || rawLastName)
    const rawPhone = cell(map.phone)
    const rawEmail = cell(map.email)
    const rawCity  = cell(map.city)
    const message = cell(map.message)
    const noteParts: string[] = []
    if (message) noteParts.push(message)
    for (const i of map.notes ?? []) {
      const value = cell(i)
      if (value) noteParts.push(`${headers[i] || `col ${i}`}: ${value}`)
    }
    const noteBody = noteParts.join('\n')
    const rowStage = 'new'
    const raw_payload = Object.fromEntries(headers.map((h, i) => [h || `col_${i}`, cells[i] ?? '']))

    // Raw first — a parse problem must never lose the lead.
    const { data: lead, error: leadError } = await sb
      .from('inbound_leads')
      .insert({
        business_id: sheet.business_id,
        provider: sheet.provider,
        raw_payload,
        dedupe_key: key,
        parsed_name: rawName || null,
        parsed_phone: rawPhone || null,
        parsed_email: rawEmail || null,
        parsed_message: message || null,
      })
      .select('id')
      .single()
    if (leadError) {
      if (leadError.code === '23505') continue // raced/duplicate — already have it
      throw new Error(leadError.message)
    }

    // Convert: match contact by phone/email inside the business, else create.
    const phone = rawPhone ? normalizePhone(rawPhone) : null
    let contactId: string | null = null
    if (phone) {
      const { data } = await sb
        .from('contacts').select('id')
        .eq('business_id', sheet.business_id).eq('phone', phone)
        .is('deleted_at', null).limit(1).maybeSingle()
      contactId = data?.id ?? null
    }
    if (!contactId && rawEmail) {
      const { data } = await sb
        .from('contacts').select('id')
        .eq('business_id', sheet.business_id).ilike('email', rawEmail)
        .is('deleted_at', null).limit(1).maybeSingle()
      contactId = data?.id ?? null
    }
    if (!contactId) {
      const { data: contact, error: contactError } = await sb
        .from('contacts')
        .insert({
          business_id: sheet.business_id,
          full_name: rawName || 'Unknown',
          phone: phone || null,
          email: rawEmail || null,
          city: rawCity || null,
          lead_source: sheet.provider,
          confirmed: false,
        })
        .select('id')
        .single()
      if (contactError) {
        await sb.from('inbound_leads')
          .update({ parse_error: contactError.message }).eq('id', lead.id)
        continue
      }
      contactId = contact.id
    } else {
      // Backfill missing fields on an existing contact matched by phone/email.
      const { data: existing } = await sb
        .from('contacts').select('full_name, phone, email, city').eq('id', contactId).single()
      if (existing) {
        const patch: Record<string, string | null> = {}
        if ((!existing.full_name || existing.full_name === 'New Lead' || existing.full_name === 'Unknown') && rawName) patch.full_name = rawName
        if (!existing.phone && phone) patch.phone = phone
        if (!existing.email && rawEmail) patch.email = rawEmail
        if (!existing.city && rawCity) patch.city = rawCity
        if (Object.keys(patch).length) await sb.from('contacts').update(patch).eq('id', contactId)
      }
    }

    // Build "Full Name - City" title
    const jobTitle = rawName && rawCity
      ? `${rawName} - ${rawCity}`
      : rawName || rawEmail || `${sheet.name} lead`

    const { data: jobNumber, error: numberError } = await sb.rpc('next_document_number_for', {
      p_business: sheet.business_id,
      p_prefix: 'EI',
    })
    if (numberError) throw new Error(numberError.message)
    const { data: job, error: jobError } = await sb
      .from('jobs')
      .insert({
        business_id: sheet.business_id,
        contact_id: contactId,
        job_number: jobNumber,
        title: jobTitle,
        stage: rowStage,
        lead_source: sheet.provider,
      })
      .select('id')
      .single()
    if (jobError) {
      await sb.from('inbound_leads').update({ parse_error: jobError.message }).eq('id', lead.id)
      continue
    }
    if (noteBody) {
      await sb.from('activities').insert({
        business_id: sheet.business_id,
        job_id: job.id,
        contact_id: contactId,
        kind: 'note',
        body: `Lead form details:\n${noteBody.slice(0, 1500)}`,
      })
    }
    await sb.from('inbound_leads')
      .update({ contact_id: contactId, job_id: job.id, converted_at: new Date().toISOString() })
      .eq('id', lead.id)
    newLeads.push({ name: rawName || rawEmail || 'Unknown', title: noteParts[0] ?? '', stage: rowStage })
    imported++
  }
  return { imported, total: dataRows.length, newLeads }
}

// Fix previously imported leads for this sheet:
//   Part 1 (DB-only, no CSV matching): find all inbound_leads linked to jobs
//     in 'quoted' with no manual stage moves and reset them to 'new'.
//   Part 2 (CSV-matched): fix titles using the refreshed column map.
async function remapSheet(sb: SupabaseClient, sheet: SheetRow) {
  // ── Part 1: stage fix via DB — no dedupe key matching required ─────────────
  // Load ALL inbound_leads for this business that have a linked job.
  let stagesFixed = 0
  const allLeads: { jobId: string; contactId: string | null }[] = []
  for (let offset = 0; ; offset += 500) {
    const { data } = await sb
      .from('inbound_leads').select('job_id, contact_id')
      .eq('business_id', sheet.business_id)
      .not('job_id', 'is', null)
      .range(offset, offset + 499)
    if (!data || data.length === 0) break
    for (const r of data) allLeads.push({ jobId: r.job_id as string, contactId: r.contact_id as string | null })
    if (data.length < 500) break
  }

  const allJobIds = allLeads.map((l) => l.jobId)

  // Find which jobs are currently in 'quoted'
  const quotedJobIds: string[] = []
  for (let i = 0; i < allJobIds.length; i += 200) {
    const { data } = await sb.from('jobs').select('id').eq('stage', 'quoted').in('id', allJobIds.slice(i, i + 200))
    for (const j of data ?? []) quotedJobIds.push(j.id as string)
  }

  // Among those, find which have been manually moved (have a stage_change activity)
  const manuallyMoved = new Set<string>()
  for (let i = 0; i < quotedJobIds.length; i += 200) {
    const { data } = await sb.from('activities').select('job_id')
      .eq('kind', 'stage_change').in('job_id', quotedJobIds.slice(i, i + 200))
    for (const a of data ?? []) manuallyMoved.add(a.job_id as string)
  }

  // Reset stage to 'new' for jobs that were never manually staged
  const toReset = quotedJobIds.filter((id) => !manuallyMoved.has(id))
  for (let i = 0; i < toReset.length; i += 200) {
    const { error } = await sb.from('jobs').update({ stage: 'new' }).in('id', toReset.slice(i, i + 200))
    if (!error) stagesFixed += Math.min(200, toReset.length - i)
  }

  // ── Part 2: title fix via CSV + dedupe key matching ─────────────────────────
  const csvUrl = toCsvUrl(sheet.sheet_url)
  if (!csvUrl) return { updated: stagesFixed, stagesFixed }
  const res = await fetch(csvUrl, { redirect: 'follow' })
  const text = await res.text()
  if (!res.ok || text.trimStart().startsWith('<')) return { updated: stagesFixed, stagesFixed }
  const rows = parseCsv(text)
  if (rows.length < 2) return { updated: stagesFixed, stagesFixed }

  const headers = rows[0]
  const aiResult2 = await aiMap(headers, rows.slice(1, 4))
  const map = (aiResult2 && nameColumnLooksValid(aiResult2, rows.slice(1, 4)))
    ? aiResult2
    : heuristicMap(headers)
  await sb.from('lead_sheets').update({ column_map: map }).eq('id', sheet.id)

  const dataRows2 = rows.slice(1)
  const keys2 = await Promise.all(dataRows2.map(async (cells) => `${sheet.id}:${await rowHash(cells)}`))

  // Load previously imported rows for this sheet by dedupe key
  const leadByKey = new Map<string, { jobId: string; contactId: string | null }>()
  for (let i = 0; i < keys2.length; i += 200) {
    const { data: leadRows } = await sb
      .from('inbound_leads').select('dedupe_key, job_id, contact_id')
      .eq('business_id', sheet.business_id).in('dedupe_key', keys2.slice(i, i + 200))
    for (const r of leadRows ?? []) {
      if (r.job_id) leadByKey.set(r.dedupe_key as string, { jobId: r.job_id as string, contactId: r.contact_id as string | null })
    }
  }

  let titlesFixed = 0
  for (let rowIndex = 0; rowIndex < dataRows2.length; rowIndex++) {
    const cells = dataRows2[rowIndex]
    const entry = leadByKey.get(keys2[rowIndex])
    if (!entry) continue
    const cell = (i: number | null) => (i !== null && cells[i] !== undefined ? cells[i].trim() : '')
    const rawFirstName = cell(map.first_name)
    const rawLastName  = cell(map.last_name)
    const rawName = cell(map.name) ||
      (rawFirstName && rawLastName ? `${rawFirstName} ${rawLastName}` : rawFirstName || rawLastName)
    const rawCity  = cell(map.city)
    const rawNameIsPhone = /^\+?\d[\d\s\-().]{6,}$|^[a-z]{1,4}:\s*\+?\d/i.test(rawName)

    if (rawName && !rawNameIsPhone) {
      const newTitle = rawName && rawCity ? `${rawName} - ${rawCity}` : rawName
      const { error } = await sb.from('jobs').update({ title: newTitle }).eq('id', entry.jobId)
      if (!error) titlesFixed++

      // Fix contact whose full_name was set to a phone number
      if (entry.contactId) {
        const { data: contact } = await sb.from('contacts').select('full_name').eq('id', entry.contactId).single()
        if (contact) {
          const nameIsPhone = /^\+?\d[\d\s\-().]{6,}$|^[a-z]{1,4}:\s*\+?\d/i.test((contact.full_name ?? '').trim())
          if (nameIsPhone) await sb.from('contacts').update({ full_name: rawName }).eq('id', entry.contactId)
        }
      }
    }
  }

  return { updated: stagesFixed + titlesFixed, stagesFixed, titlesFixed }
}

// One digest email per sheet run via Resend — silently skipped when
// RESEND_API_KEY is missing.
async function notifyNewLeads(
  sb: SupabaseClient,
  sheet: SheetRow,
  newLeads: { name: string; title: string; stage: string }[],
): Promise<boolean> {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey || newLeads.length === 0) return false
  const { data: members } = await sb
    .from('business_members')
    .select('profile:profiles!business_members_user_id_fkey ( email )')
    .eq('business_id', sheet.business_id)
    .eq('status', 'active')
  const to = [
    ...new Set(
      ((members ?? []) as unknown as { profile: { email: string | null } | null }[])
        .map((m) => m.profile?.email)
        .filter((e): e is string => !!e),
    ),
  ]
  if (!to.length) return false
  const appUrl = Deno.env.get('APP_URL') ?? 'http://localhost:5173'
  const items = newLeads
    .slice(0, 20)
    .map(
      (l) =>
        `<li><strong>${l.name}</strong>${l.title ? ` — ${l.title}` : ''} <em>(${l.stage})</em></li>`,
    )
    .join('')
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: Deno.env.get('EMAIL_FROM') ?? 'Eternal CRM <onboarding@resend.dev>',
      to,
      subject: `${newLeads.length} new lead${newLeads.length === 1 ? '' : 's'} — ${sheet.name}`,
      html: `<p>New lead${newLeads.length === 1 ? '' : 's'} just landed in your pipeline from <strong>${sheet.name}</strong>:</p><ul>${items}</ul>${newLeads.length > 20 ? `<p>…and ${newLeads.length - 20} more.</p>` : ''}<p><a href="${appUrl}/pipeline">Open the pipeline →</a></p>`,
    }),
  })
  return res.ok
}

// ── HTTP ─────────────────────────────────────────────────────────────────────


function isServiceRole(req: Request): boolean {
  try {
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
    const payload = JSON.parse(atob(token.split('.')[1]))
    // Signature already verified by the platform gateway (verify_jwt).
    return payload.role === 'service_role'
  } catch {
    return false
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  // Cron path: the scheduler authenticates with the service role and syncs
  // every business's active sheets (no user context).
  const isCron = isServiceRole(req)

  let auth: { userId: string } | Response = { userId: '' }
  if (!isCron) {
    auth = await requireStaff(req)
    if (auth instanceof Response) return auth
  }

  let body: { action?: string; sheetId?: string; sheetUrl?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  let businessId: string | null = null
  if (!isCron) {
    const { data: profile } = await sb
      .from('profiles').select('active_business_id').eq('id', (auth as { userId: string }).userId).single()
    businessId = profile?.active_business_id ?? null
    if (!businessId) return json({ error: 'No active business' }, 400)
  }

  if (body.action === 'preview') {
    if (!body.sheetUrl) return json({ error: 'sheetUrl required' }, 400)
    const csvUrl = toCsvUrl(body.sheetUrl)
    if (!csvUrl) return json({ error: 'Not a recognizable Google Sheet / CSV link' }, 400)
    const res = await fetch(csvUrl, { redirect: 'follow' })
    const text = await res.text()
    if (!res.ok || text.trimStart().startsWith('<')) {
      return json({ error: 'Could not read the sheet — turn on link sharing ("Anyone with the link can view")' }, 400)
    }
    const rows = parseCsv(text)
    if (rows.length < 1) return json({ error: 'Sheet is empty' }, 400)
    const map = (await aiMap(rows[0], rows.slice(1, 4))) ?? heuristicMap(rows[0])
    return json({ headers: rows[0], rowCount: rows.length - 1, map })
  }

  if (body.action === 'sync') {
    let query = sb.from('lead_sheets').select('*').eq('active', true)
    if (!isCron) query = query.eq('business_id', businessId!)
    if (body.sheetId) query = query.eq('id', body.sheetId)
    const { data: sheets, error } = await query
    if (error) return json({ error: error.message }, 500)
    const results = []
    for (const sheet of (sheets ?? []) as SheetRow[]) {
      try {
        const r = await syncSheet(sb, sheet)
        await sb.from('lead_sheets').update({
          last_synced_at: new Date().toISOString(),
          last_error: null,
          rows_imported: r.imported,
        }).eq('id', sheet.id)
        const emailed = await notifyNewLeads(sb, sheet, r.newLeads).catch(() => false)
        results.push({ sheet: sheet.name, imported: r.imported, total: r.total, emailed })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        await sb.from('lead_sheets').update({
          last_synced_at: new Date().toISOString(),
          last_error: msg,
        }).eq('id', sheet.id)
        results.push({ sheet: sheet.name, error: msg })
      }
    }
    return json({ results })
  }

  if (body.action === 'remap') {
    if (!body.sheetId) return json({ error: 'sheetId required' }, 400)
    const { data: sheet, error } = await sb
      .from('lead_sheets').select('*')
      .eq('business_id', businessId).eq('id', body.sheetId).single()
    if (error) return json({ error: error.message }, 500)
    try {
      const r = await remapSheet(sb, sheet as SheetRow)
      return json(r)
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : String(e) }, 500)
    }
  }

  return json({ error: 'action must be sync, remap, or preview' }, 400)
})
