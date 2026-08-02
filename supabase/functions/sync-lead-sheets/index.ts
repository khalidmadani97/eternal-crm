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
import { json, requireStaff } from '../_shared/twilio.ts'

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
  phone: number | null
  email: number | null
  message: number | null
  mapped_by: 'ai' | 'heuristic'
}

function heuristicMap(headers: string[]): ColumnMap {
  const find = (patterns: RegExp[]) => {
    const i = headers.findIndex((h) => patterns.some((p) => p.test(h.toLowerCase())))
    return i === -1 ? null : i
  }
  return {
    name: find([/full.?name/, /^name$/, /first.?name/, /contact/]),
    phone: find([/phone/, /mobile/, /tel/, /number/]),
    email: find([/e.?mail/]),
    message: find([/message/, /notes?/, /comment/, /inquiry|enquiry/, /details?/, /describe|description/, /project/]),
    mapped_by: 'heuristic',
  }
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
              'You map lead-form spreadsheet columns. Given headers (0-indexed) and sample rows, return JSON {"name":i|null,"phone":i|null,"email":i|null,"message":i|null} — the column INDEX holding the lead\'s full name, phone, email, and free-text message/project description. Use the samples to disambiguate (e.g. a column of digits is the phone even if the header is cryptic). null when absent.',
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
    return { name: idx(m.name), phone: idx(m.phone), email: idx(m.email), message: idx(m.message), mapped_by: 'ai' }
  } catch {
    return null
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
  if (!map || (map.name === null && map.phone === null && map.email === null)) {
    map = (await aiMap(headers, dataRows.slice(0, 3))) ?? heuristicMap(headers)
    await sb.from('lead_sheets').update({ column_map: map }).eq('id', sheet.id)
  }

  let imported = 0
  for (const cells of dataRows) {
    const key = `${sheet.id}:${await rowHash(cells)}`
    const { data: existing } = await sb
      .from('inbound_leads')
      .select('id')
      .eq('business_id', sheet.business_id)
      .eq('dedupe_key', key)
      .maybeSingle()
    if (existing) continue

    const cell = (i: number | null) => (i !== null && cells[i] !== undefined ? cells[i].trim() : '')
    const rawName = cell(map.name)
    const rawPhone = cell(map.phone)
    const rawEmail = cell(map.email)
    const message = cell(map.message)
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
    if (leadError) throw new Error(leadError.message)

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
          full_name: rawName || rawEmail || phone || 'Sheet lead',
          phone,
          email: rawEmail || null,
          lead_source: sheet.provider,
        })
        .select('id')
        .single()
      if (contactError) {
        await sb.from('inbound_leads')
          .update({ parse_error: contactError.message }).eq('id', lead.id)
        continue
      }
      contactId = contact.id
    }

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
        title: message ? message.slice(0, 80) : `${sheet.name} lead`,
        stage: 'new',
        lead_source: sheet.provider,
      })
      .select('id')
      .single()
    if (jobError) {
      await sb.from('inbound_leads').update({ parse_error: jobError.message }).eq('id', lead.id)
      continue
    }
    if (message) {
      await sb.from('activities').insert({
        business_id: sheet.business_id,
        job_id: job.id,
        contact_id: contactId,
        kind: 'note',
        body: `Lead form message: ${message.slice(0, 500)}`,
      })
    }
    await sb.from('inbound_leads')
      .update({ contact_id: contactId, job_id: job.id, converted_at: new Date().toISOString() })
      .eq('id', lead.id)
    imported++
  }
  return { imported, total: dataRows.length }
}

// ── HTTP ─────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const auth = await requireStaff(req)
  if (auth instanceof Response) return auth

  let body: { action?: string; sheetId?: string; sheetUrl?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: profile } = await sb
    .from('profiles').select('active_business_id').eq('id', auth.userId).single()
  const businessId = profile?.active_business_id
  if (!businessId) return json({ error: 'No active business' }, 400)

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
    let query = sb.from('lead_sheets').select('*').eq('business_id', businessId).eq('active', true)
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
        results.push({ sheet: sheet.name, ...r })
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

  return json({ error: 'action must be sync or preview' }, 400)
})
