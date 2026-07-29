// Shared helpers for the one-shot Slice 12 import scripts.
// DELETE the scripts directory after cutover (ROADMAP Slice 12).

import { createClient } from '@supabase/supabase-js'

export function getClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.')
    console.error('For the LOCAL stack: SUPABASE_URL=http://127.0.0.1:54321')
    process.exit(1)
  }
  if (!url.includes('127.0.0.1') && !process.argv.includes('--linked-yes-i-mean-it')) {
    console.error(
      'Refusing to run against a non-local URL without --linked-yes-i-mean-it.\n' +
        'The linked project will hold live financial records (DECISIONS 016).',
    )
    process.exit(1)
  }
  return createClient(url, key)
}

/** Minimal CSV parser — handles quoted fields, embedded commas, "" escapes. */
export function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (c === '"') {
        inQuotes = false
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      field = ''
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
    } else {
      field += c
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    if (row.length > 1 || row[0] !== '') rows.push(row)
  }
  const [header, ...data] = rows
  return data.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), r[i] ?? ''])))
}

/** E.164 normalisation matching src/lib/format.ts — Canada default. */
export function normalizePhone(input) {
  if (!input) return null
  const digits = input.trim().replace(/[^\d+]/g, '')
  if (/^\+[1-9]\d{7,14}$/.test(digits)) return digits
  const bare = digits.replace(/\D/g, '')
  if (bare.length === 10) return `+1${bare}`
  if (bare.length === 11 && bare.startsWith('1')) return `+${bare}`
  return null
}

export const isDryRun = !process.argv.includes('--execute')

export function banner(name) {
  console.log(`\n=== ${name} ${isDryRun ? '(DRY RUN — pass --execute to write)' : '(EXECUTING)'} ===\n`)
}
