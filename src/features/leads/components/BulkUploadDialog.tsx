// Bulk lead upload wizard: CSV / XLSX → column map → stage picker → import with duplicate resolution
import { useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../../../lib/supabase'
import { normalizePhone } from '../../../lib/format'
import type { JobStage } from '../../jobs/api'

// ── Field targets ─────────────────────────────────────────────────────────────

type FieldTarget =
  | 'full_name' | 'phone' | 'email' | 'city' | 'contact_type'
  | 'lead_source' | 'summary' | 'direction' | 'lead_grade'
  | 'notes' | 'ignore'

const FIELD_LABELS: [FieldTarget, string][] = [
  ['full_name', 'Name'],
  ['phone', 'Phone'],
  ['email', 'Email'],
  ['city', 'City'],
  ['contact_type', 'Contact type'],
  ['lead_source', 'Lead source'],
  ['summary', 'Summary (card label)'],
  ['direction', 'Direction (N/S/E/W)'],
  ['lead_grade', 'Lead grade (1–5)'],
  ['notes', 'Notes'],
  ['ignore', '— Ignore —'],
]

// ── Heuristic mapping ─────────────────────────────────────────────────────────

function heuristicMap(headers: string[]): Record<number, FieldTarget> {
  const find = (patterns: RegExp[]): number | null => {
    const i = headers.findIndex((h) => patterns.some((p) => p.test(h.trim().toLowerCase())))
    return i === -1 ? null : i
  }
  const used = new Set<number>()
  const map: Record<number, FieldTarget> = {}
  const assign = (idx: number | null, target: FieldTarget) => {
    if (idx === null || used.has(idx)) return
    map[idx] = target
    used.add(idx)
  }
  assign(find([/full.?name/, /^names?$/, /^n$/, /^full$/, /contact/]), 'full_name')
  assign(find([/^first.?name$/, /^first$/, /^fn$/]), 'full_name')
  assign(find([/phone/, /mobile/, /^p$/, /^ph$/, /^mob$/, /^cell$/]), 'phone')
  assign(find([/e.?mail/, /^e$/, /^em$/]), 'email')
  assign(find([/^city$/, /^c$/, /location/, /area/, /town/, /region/]), 'city')
  assign(find([/source/, /channel/, /medium/]), 'lead_source')
  assign(find([/direction/, /^dir$/]), 'direction')
  assign(find([/summary/, /desc(ription)?/, /^service$/]), 'summary')
  assign(find([/grade/, /rating/, /score/, /quality/]), 'lead_grade')
  assign(find([/type.*contact|contact.*type|homeowner|builder|contractor/]), 'contact_type')
  const META = /time|date|^id$|campaign|ad.?(set|name|id)|form|platform|created|timestamp/
  for (let i = 0; i < headers.length; i++) {
    if (used.has(i)) continue
    const h = headers[i].trim().toLowerCase()
    map[i] = h && !META.test(h) ? 'notes' : 'ignore'
  }
  return map
}

// ── File parsing ──────────────────────────────────────────────────────────────

async function parseFile(file: File): Promise<{ headers: string[]; rows: string[][] }> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: false })
  if (!raw.length) return { headers: [], rows: [] }
  const headers = (raw[0] as unknown[]).map((v) => String(v ?? ''))
  const rows = (raw.slice(1) as unknown[][])
    .map((r) => headers.map((_, i) => String(r[i] ?? '').trim()))
    .filter((r) => r.some((c) => c !== ''))
  return { headers, rows }
}

// ── Duplicate dialog ──────────────────────────────────────────────────────────

type DuplicateChoice = 'skip' | 'update' | 'create_new'

interface DuplicateState {
  existing: { id: string; full_name: string; phone: string | null; email: string | null }
  incoming: { name: string; phone: string | null; email: string | null }
  resolve: (choice: DuplicateChoice) => void
}

function DuplicateDialog({ state }: { state: DuplicateState }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-2xl">
        <h3 className="mb-3 text-base font-semibold text-stone-900">Duplicate found</h3>
        <div className="mb-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded border border-stone-200 p-3">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-400">Existing</p>
            <p className="font-medium text-stone-900">{state.existing.full_name}</p>
            {state.existing.phone && <p className="mt-0.5 text-stone-500">{state.existing.phone}</p>}
            {state.existing.email && (
              <p className="mt-0.5 truncate text-stone-500">{state.existing.email}</p>
            )}
          </div>
          <div className="rounded border border-amber-200 bg-amber-50 p-3">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-400">Incoming</p>
            <p className="font-medium text-stone-900">{state.incoming.name || '—'}</p>
            {state.incoming.phone && <p className="mt-0.5 text-stone-500">{state.incoming.phone}</p>}
            {state.incoming.email && (
              <p className="mt-0.5 truncate text-stone-500">{state.incoming.email}</p>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => state.resolve('skip')}
            className="rounded border border-stone-300 px-4 py-2 text-sm text-stone-700 hover:bg-stone-50"
          >
            Skip — don't import this row
          </button>
          <button
            onClick={() => state.resolve('update')}
            className="rounded border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800 hover:bg-amber-100"
          >
            Use existing contact + create new lead
          </button>
          <button
            onClick={() => state.resolve('create_new')}
            className="rounded border border-stone-300 px-4 py-2 text-sm text-stone-700 hover:bg-stone-50"
          >
            Create new contact + lead
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Stage label helper ────────────────────────────────────────────────────────

function stageLabel(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

// ── Main wizard ────────────────────────────────────────────────────────────────

interface Props {
  stages: JobStage[]
  pipelineId: string | null
  onClose: () => void
  onDone?: () => void
}

export function BulkUploadDialog({ stages, pipelineId, onClose, onDone }: Props) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<string[][]>([])
  const [mapping, setMapping] = useState<Record<number, FieldTarget>>({})
  const firstWorkingStage = stages.find((s) => s !== 'won' && s !== 'lost') ?? ('new' as JobStage)
  const [targetStage, setTargetStage] = useState<JobStage>(firstWorkingStage)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [result, setResult] = useState<{
    imported: number
    skipped: number
    errors: string[]
  } | null>(null)
  const [dupState, setDupState] = useState<DuplicateState | null>(null)
  const [dragOver, setDragOver] = useState(false)

  // ── File drop/pick ──────────────────────────────────────────────────────────

  const loadFile = async (file: File) => {
    try {
      const parsed = await parseFile(file)
      if (!parsed.headers.length) { alert('File appears to be empty.'); return }
      setHeaders(parsed.headers)
      setRows(parsed.rows)
      setMapping(heuristicMap(parsed.headers))
      setStep(2)
    } catch (e) {
      alert('Could not read the file: ' + (e instanceof Error ? e.message : String(e)))
    }
  }

  // ── Duplicate resolution (Promise-pause pattern) ────────────────────────────

  const resolveRef = useRef<((c: DuplicateChoice) => void) | null>(null)

  const askDuplicate = (
    existing: DuplicateState['existing'],
    incoming: DuplicateState['incoming'],
  ): Promise<DuplicateChoice> =>
    new Promise((res) => {
      resolveRef.current = (choice) => {
        setDupState(null)
        res(choice)
      }
      setDupState({ existing, incoming, resolve: resolveRef.current })
    })

  // ── Import ──────────────────────────────────────────────────────────────────

  const runImport = async () => {
    setStep(4)
    setProgress({ done: 0, total: rows.length })
    let imported = 0
    let skipped = 0
    const errors: string[] = []

    for (let i = 0; i < rows.length; i++) {
      setProgress({ done: i, total: rows.length })
      const row = rows[i]

      const get = (target: FieldTarget): string =>
        Object.entries(mapping)
          .filter(([, v]) => v === target)
          .map(([k]) => row[Number(k)] ?? '')
          .find((v) => v.trim()) ?? ''

      const getNotes = (): string[] =>
        Object.entries(mapping)
          .filter(([, v]) => v === 'notes')
          .map(([k]) => {
            const val = row[Number(k)]?.trim()
            return val ? `${headers[Number(k)] || `col ${k}`}: ${val}` : ''
          })
          .filter(Boolean)

      const rawName = get('full_name')
      const rawPhone = get('phone')
      const rawEmail = get('email')
      const rawCity = get('city')
      const rawContactType = get('contact_type').toLowerCase()
      const rawLeadSource = get('lead_source')
      const rawSummary = get('summary')
      const rawDirection = get('direction').toLowerCase()
      const rawGrade = get('lead_grade')
      const noteParts = getNotes()

      if (!rawName && !rawPhone && !rawEmail) { skipped++; continue }

      const phone = rawPhone ? normalizePhone(rawPhone) : null

      // Duplicate check
      let existingContact: DuplicateState['existing'] | null = null
      if (phone) {
        const { data } = await supabase
          .from('contacts')
          .select('id, full_name, phone, email')
          .eq('phone', phone)
          .is('deleted_at', null)
          .limit(1)
          .maybeSingle()
        if (data) existingContact = data as DuplicateState['existing']
      }
      if (!existingContact && rawEmail) {
        const { data } = await supabase
          .from('contacts')
          .select('id, full_name, phone, email')
          .ilike('email', rawEmail)
          .is('deleted_at', null)
          .limit(1)
          .maybeSingle()
        if (data) existingContact = data as DuplicateState['existing']
      }

      let contactId: string | null = null

      if (existingContact) {
        const choice = await askDuplicate(existingContact, {
          name: rawName,
          phone,
          email: rawEmail || null,
        })
        if (choice === 'skip') { skipped++; continue }
        if (choice === 'update') {
          // Backfill missing fields, keep existing data
          const patch: Record<string, unknown> = {}
          if (
            rawName &&
            (!existingContact.full_name ||
              existingContact.full_name === 'New Lead' ||
              existingContact.full_name === 'Unknown')
          )
            patch.full_name = rawName
          if (phone && !existingContact.phone) patch.phone = phone
          if (rawEmail && !existingContact.email) patch.email = rawEmail
          if (Object.keys(patch).length)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await supabase.from('contacts').update(patch as any).eq('id', existingContact.id)
          contactId = existingContact.id
        }
        // choice === 'create_new': fall through to create a new contact
      }

      if (!contactId) {
        const contactInput: Record<string, unknown> = {
          full_name: rawName || 'Unknown',
          phone: phone || null,
          email: rawEmail || null,
          city: rawCity || null,
          lead_source: rawLeadSource || null,
          confirmed: false,
        }
        if (['homeowner', 'builder', 'contractor'].includes(rawContactType))
          contactInput.contact_type = rawContactType
        const grade = parseInt(rawGrade)
        if (!isNaN(grade) && grade >= 1 && grade <= 5) contactInput.lead_grade = grade

        const { data: newContact, error: cErr } = await supabase
          .from('contacts')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .insert(contactInput as any)
          .select('id')
          .single()
        if (cErr) { errors.push(`Row ${i + 2}: ${cErr.message}`); continue }
        contactId = newContact.id
      }

      // Job number + job
      const { data: jobNumber, error: numErr } = await supabase.rpc('next_document_number', {
        p_prefix: 'EI',
      })
      if (numErr) { errors.push(`Row ${i + 2}: ${numErr.message}`); continue }

      const jobTitle =
        rawName && rawCity ? `${rawName} - ${rawCity}` : rawName || rawEmail || 'Uploaded lead'

      const jobInput: Record<string, unknown> = {
        contact_id: contactId,
        job_number: jobNumber,
        stage: targetStage,
        pipeline_id: pipelineId,
        title: jobTitle,
      }
      if (rawSummary) jobInput.summary = rawSummary
      if (rawLeadSource) jobInput.lead_source = rawLeadSource
      if (['north', 'south', 'east', 'west'].includes(rawDirection)) jobInput.direction = rawDirection

      const { data: job, error: jobErr } = await supabase
        .from('jobs')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert(jobInput as any)
        .select('id')
        .single()
      if (jobErr) { errors.push(`Row ${i + 2}: ${jobErr.message}`); continue }

      if (noteParts.length) {
        await supabase.from('activities').insert({
          job_id: job.id,
          contact_id: contactId,
          kind: 'note',
          body: `Lead form details:\n${noteParts.join('\n').slice(0, 1500)}`,
        })
      }

      // Store raw row so Sara can see it
      await supabase.from('inbound_leads').insert({
        provider: 'manual' as const,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        raw_payload: Object.fromEntries(headers.map((h, idx) => [h || `col_${idx}`, row[idx] ?? ''])) as any,
        parsed_name: rawName || null,
        parsed_phone: rawPhone || null,
        parsed_email: rawEmail || null,
        contact_id: contactId,
        job_id: job.id,
        converted_at: new Date().toISOString(),
      })

      imported++
    }

    setProgress({ done: rows.length, total: rows.length })
    setResult({ imported, skipped, errors })
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Step 1 — drop zone */}
      {step === 1 && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-stone-900">Upload leads</h2>
              <button onClick={onClose} className="text-stone-400 hover:text-stone-700">✕</button>
            </div>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragOver(false)
                const file = e.dataTransfer.files[0]
                if (file) void loadFile(file)
              }}
              className={`flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed py-14 transition-colors ${
                dragOver ? 'border-amber-500 bg-amber-50' : 'border-stone-300 bg-stone-50'
              }`}
            >
              <p className="text-sm font-medium text-stone-700">Drop a CSV or XLSX file here</p>
              <p className="text-xs text-stone-400">or</p>
              <label className="cursor-pointer rounded border border-stone-300 px-4 py-2 text-sm text-stone-700 hover:bg-stone-100">
                Browse
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) void loadFile(file)
                  }}
                />
              </label>
              <p className="text-xs text-stone-400">.csv · .xlsx · .xls</p>
            </div>
          </div>
        </div>
      )}

      {/* Step 2 — column mapper */}
      {step === 2 && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[90dvh] w-full max-w-3xl flex-col rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-stone-200 px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-stone-900">Map columns</h2>
                <p className="text-sm text-stone-500">{rows.length} rows · {headers.length} columns</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-stone-50">
                  <tr className="text-left text-xs font-semibold uppercase tracking-wide text-stone-500">
                    <th className="px-6 py-2.5">Column</th>
                    <th className="px-3 py-2.5">Sample values</th>
                    <th className="px-3 py-2.5 pr-6">Maps to</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {headers.map((h, i) => {
                    const samples = rows
                      .slice(0, 3)
                      .map((r) => r[i])
                      .filter(Boolean)
                      .slice(0, 2)
                    return (
                      <tr key={i} className="hover:bg-stone-50">
                        <td className="px-6 py-2.5 font-medium text-stone-800">
                          {h || <span className="text-stone-400 italic">col {i}</span>}
                        </td>
                        <td className="px-3 py-2.5 text-stone-500">
                          {samples.length
                            ? samples.join(' · ')
                            : <span className="text-stone-300">—</span>}
                        </td>
                        <td className="px-3 py-2.5 pr-6">
                          <select
                            value={mapping[i] ?? 'ignore'}
                            onChange={(e) =>
                              setMapping((m) => ({ ...m, [i]: e.target.value as FieldTarget }))
                            }
                            className="rounded border border-stone-300 bg-white px-2 py-1 text-sm"
                          >
                            {FIELD_LABELS.map(([v, label]) => (
                              <option key={v} value={v}>{label}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between border-t border-stone-200 px-6 py-4">
              <button
                onClick={() => setStep(1)}
                className="rounded border border-stone-300 px-4 py-2 text-sm text-stone-700 hover:bg-stone-50"
              >
                ← Back
              </button>
              <button
                onClick={() => setStep(3)}
                className="rounded bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800"
              >
                Next →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 3 — stage picker */}
      {step === 3 && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold text-stone-900">Import settings</h2>

            <div className="mb-4">
              <label className="mb-1.5 block text-sm font-medium text-stone-700">
                Land leads in stage
              </label>
              <select
                value={targetStage}
                onChange={(e) => setTargetStage(e.target.value as JobStage)}
                className="w-full rounded border border-stone-300 bg-white px-3 py-2 text-sm"
              >
                {stages
                  .filter((s) => s !== 'won' && s !== 'lost')
                  .map((s) => (
                    <option key={s} value={s}>{stageLabel(s)}</option>
                  ))}
              </select>
            </div>

            <div className="mb-6 rounded-lg border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-600">
              Importing <strong>{rows.length} rows</strong>. Duplicates (matched by phone or email)
              will be shown one at a time for you to resolve.
            </div>

            <div className="flex justify-between">
              <button
                onClick={() => setStep(2)}
                className="rounded border border-stone-300 px-4 py-2 text-sm text-stone-700 hover:bg-stone-50"
              >
                ← Back
              </button>
              <button
                onClick={() => void runImport()}
                className="rounded bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800"
              >
                Import {rows.length} leads
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 4 — progress + result */}
      {step === 4 && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            {!result ? (
              <>
                <h2 className="mb-4 text-lg font-semibold text-stone-900">Importing…</h2>
                <div className="mb-2 h-2 overflow-hidden rounded-full bg-stone-200">
                  <div
                    className="h-full rounded-full bg-amber-500 transition-all"
                    style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
                  />
                </div>
                <p className="text-sm text-stone-500">
                  {progress.done} / {progress.total} rows
                </p>
              </>
            ) : (
              <>
                <h2 className="mb-4 text-lg font-semibold text-stone-900">Done</h2>
                <div className="mb-4 space-y-2 text-sm">
                  <p className="text-stone-700">
                    <span className="font-semibold text-emerald-700">{result.imported}</span> leads imported
                  </p>
                  {result.skipped > 0 && (
                    <p className="text-stone-500">{result.skipped} rows skipped</p>
                  )}
                  {result.errors.length > 0 && (
                    <div className="rounded border border-red-200 bg-red-50 p-3">
                      <p className="mb-1 font-medium text-red-700">
                        {result.errors.length} error{result.errors.length > 1 ? 's' : ''}
                      </p>
                      <ul className="list-inside list-disc space-y-0.5 text-red-600">
                        {result.errors.slice(0, 5).map((e, i) => (
                          <li key={i} className="text-xs">{e}</li>
                        ))}
                        {result.errors.length > 5 && (
                          <li className="text-xs">…and {result.errors.length - 5} more</li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={() => { onDone?.(); onClose() }}
                    className="rounded bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800"
                  >
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Duplicate resolution overlay (on top of step 4) */}
      {dupState && <DuplicateDialog state={dupState} />}
    </>
  )
}
