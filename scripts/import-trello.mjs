#!/usr/bin/env node
// One-shot Trello board import (Slice 12). DELETE AFTER CUTOVER.
//
// Usage:
//   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=… \
//     node scripts/import-trello.mjs path/to/trello-export.csv [--execute]
//
// Expects the Trello CSV export (Board menu → Print and export → CSV) with at
// least: "Card Name", "List Name", "Description", "Due Date".
// Contact details are parsed from the description when present:
//   phone: first phone-looking token · email: first email-looking token
// Cards whose list is not in STAGE_MAP are reported and skipped — extend the
// map rather than guessing.

import { readFileSync } from 'node:fs'
import { banner, getClient, isDryRun, normalizePhone, parseCsv } from './lib/import-common.mjs'

// Adjust to the real board's list names before running.
const STAGE_MAP = {
  'New Leads': 'new',
  Contacted: 'contacted',
  'Quote Sent': 'quoted',
  'Follow Up': 'follow_up',
  Won: 'won',
  Template: 'templated',
  Fabrication: 'fabrication',
  'Install Scheduled': 'scheduled',
  Installed: 'installed',
  Done: 'closed',
  Lost: 'lost',
}

const file = process.argv[2]
if (!file) {
  console.error('Usage: node scripts/import-trello.mjs <trello.csv> [--execute]')
  process.exit(1)
}

banner('Trello import')
const rows = parseCsv(readFileSync(file, 'utf8'))
const sb = getClient()

const PHONE_RE = /(\+?1?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/
const EMAIL_RE = /([^\s@]+@[^\s@]+\.[^\s@]+)/

let imported = 0
let skipped = 0
for (const row of rows) {
  const title = (row['Card Name'] ?? '').trim()
  const list = (row['List Name'] ?? '').trim()
  const description = row['Description'] ?? ''
  if (!title) continue
  const stage = STAGE_MAP[list]
  if (!stage) {
    console.log(`SKIP (unmapped list "${list}"): ${title}`)
    skipped++
    continue
  }
  const phone = normalizePhone(PHONE_RE.exec(description)?.[1] ?? '')
  const email = EMAIL_RE.exec(description)?.[1] ?? null
  // Convention on our board: card name is "Client Name — job description".
  const [namePart, ...titleParts] = title.split('—').map((s) => s.trim())
  const contactName = namePart || title
  const jobTitle = titleParts.join(' — ') || title

  console.log(
    `${list} → ${stage}: contact "${contactName}", job "${jobTitle}"` +
      (phone ? `, ${phone}` : '') +
      (email ? `, ${email}` : ''),
  )
  if (isDryRun) {
    imported++
    continue
  }

  // Match contact by phone first (threading key), then by exact name.
  let contactId = null
  if (phone) {
    const { data } = await sb.from('contacts').select('id').eq('phone', phone).maybeSingle()
    contactId = data?.id ?? null
  }
  if (!contactId) {
    const { data } = await sb
      .from('contacts')
      .select('id')
      .eq('full_name', contactName)
      .is('deleted_at', null)
      .maybeSingle()
    contactId = data?.id ?? null
  }
  if (!contactId) {
    const { data, error } = await sb
      .from('contacts')
      .insert({ full_name: contactName, phone, email, lead_source: 'trello-import', notes: description || null })
      .select('id')
      .single()
    if (error) throw new Error(`contact insert failed for "${contactName}": ${error.message}`)
    contactId = data.id
  }

  const { data: jobNumber, error: numberError } = await sb.rpc('next_document_number', {
    p_prefix: 'EI',
  })
  if (numberError) throw new Error(numberError.message)
  const { error: jobError } = await sb.from('jobs').insert({
    contact_id: contactId,
    job_number: jobNumber,
    title: jobTitle,
    stage,
    lead_source: 'trello-import',
  })
  if (jobError) throw new Error(`job insert failed for "${jobTitle}": ${jobError.message}`)
  imported++
}

console.log(`\n${isDryRun ? 'Would import' : 'Imported'} ${imported} cards; skipped ${skipped}.`)
