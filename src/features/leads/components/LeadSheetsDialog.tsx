import { useState } from 'react'
import { formatDateTime } from '../../../lib/format'
import { useAddLeadSheet, useDeleteLeadSheet, useLeadSheets, useRemapLeadSheet, useSyncLeadSheets } from '../api'

/** Live lead-sheet sources (Slice 39): connect the Google Sheet behind a
 *  Meta Lead Ads form or Google Form; new rows become pipeline leads. */
export function LeadSheetsDialog({ onClose }: { onClose: () => void }) {
  const { data: sheets, isPending, isError, error } = useLeadSheets()
  const addSheet = useAddLeadSheet()
  const deleteSheet = useDeleteLeadSheet()
  const sync = useSyncLeadSheets()
  const remap = useRemapLeadSheet()
  const [form, setForm] = useState({ name: '', provider: 'meta', sheet_url: '' })

  const add = () => {
    if (!form.name.trim() || !form.sheet_url.trim()) return
    addSheet.mutate(
      { name: form.name.trim(), provider: form.provider, sheet_url: form.sheet_url.trim() },
      { onSuccess: () => setForm({ name: '', provider: form.provider, sheet_url: '' }) },
    )
  }

  const inputClass =
    'rounded border border-stone-300 px-3 py-2 text-sm focus:border-amber-600 focus:outline-none'

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-4 shadow-xl sm:p-6">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-stone-900">Live lead sources</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700">✕</button>
        </div>
        <p className="mb-4 text-xs leading-relaxed text-stone-500">
          Point the pipeline at the Google Sheet your Meta Lead Ads or Google Form writes to
          (File → Share → “Anyone with the link can view”). New rows become leads automatically —
          names, phones, and messages are mapped by AI, duplicates are impossible, and the raw row
          is always kept.
        </p>

        <div className="mb-4 flex flex-wrap items-center gap-2 rounded border border-dashed border-stone-300 p-3">
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Name (e.g. Meta — Kitchen campaign)"
            className={`${inputClass} min-w-44 flex-1`}
          />
          <select
            value={form.provider}
            onChange={(e) => setForm({ ...form, provider: e.target.value })}
            className={inputClass}
          >
            <option value="meta">Meta lead form</option>
            <option value="google_ads">Google lead form</option>
            <option value="website">Website</option>
            <option value="other">Other sheet</option>
          </select>
          <input
            value={form.sheet_url}
            onChange={(e) => setForm({ ...form, sheet_url: e.target.value })}
            placeholder="Google Sheet link…"
            className={`${inputClass} w-full`}
          />
          <button
            onClick={add}
            disabled={addSheet.isPending || !form.name.trim() || !form.sheet_url.trim()}
            className="rounded bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
          >
            {addSheet.isPending ? 'Checking sheet…' : 'Connect'}
          </button>
          {addSheet.isError && <p className="w-full text-sm text-red-600">{addSheet.error.message}</p>}
        </div>

        {isPending && <p className="py-2 text-sm text-stone-500">Loading sources…</p>}
        {isError && <p className="py-2 text-sm text-red-600">{error.message}</p>}
        {sheets && sheets.length === 0 && (
          <p className="py-2 text-sm text-stone-500">No sources connected yet.</p>
        )}
        <ul className="divide-y divide-stone-100">
          {sheets?.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-2.5 text-sm">
              <span
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                  s.last_error ? 'bg-red-500' : s.last_synced_at ? 'bg-emerald-500' : 'bg-stone-300'
                }`}
                title={s.last_error ?? (s.last_synced_at ? 'Healthy' : 'Never synced')}
              />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-stone-900">
                  {s.name} <span className="text-xs font-normal text-stone-400">· {s.provider}</span>
                </p>
                <p className="truncate text-xs text-stone-400">
                  {s.last_error
                    ? s.last_error
                    : s.last_synced_at
                      ? `Synced ${formatDateTime(s.last_synced_at)} · ${s.rows_imported} new last run`
                      : 'Not synced yet'}
                </p>
              </div>
              <button
                onClick={() => sync.mutate(s.id)}
                disabled={sync.isPending}
                className="shrink-0 rounded border border-stone-300 px-2 py-1 text-xs text-stone-700 hover:bg-stone-50 disabled:opacity-50"
              >
                {sync.isPending ? 'Syncing…' : 'Sync now'}
              </button>
              <button
                onClick={() => {
                  if (
                    window.confirm(
                      `Re-map "${s.name}"? Titles and stages of already-imported leads are re-derived from the sheet.`,
                    )
                  )
                    remap.mutate(s.id)
                }}
                disabled={remap.isPending}
                className="shrink-0 rounded border border-stone-300 px-2 py-1 text-xs text-stone-700 hover:bg-stone-50 disabled:opacity-50"
                title="Fix titles/stages of leads imported before a mapping improvement"
              >
                {remap.isPending ? 'Re-mapping…' : 'Re-map'}
              </button>
              <button
                onClick={() => {
                  if (window.confirm(`Disconnect "${s.name}"? Already-imported leads stay.`))
                    deleteSheet.mutate(s.id)
                }}
                className="shrink-0 text-stone-300 hover:text-red-600"
                aria-label={`Disconnect ${s.name}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        {sync.data && (
          <p className="mt-3 rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {sync.data.results
              .map((r) => (r.error ? `${r.sheet}: ${r.error}` : `${r.sheet}: ${r.imported} new lead${r.imported === 1 ? '' : 's'}`))
              .join(' · ')}
          </p>
        )}
        {sync.isError && <p className="mt-3 text-sm text-red-600">{sync.error.message}</p>}
        {remap.data && (
          <p className="mt-3 rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Re-mapped {remap.data.updated} leads from the sheet.
          </p>
        )}
        {remap.isError && <p className="mt-3 text-sm text-red-600">{remap.error.message}</p>}
        <p className="mt-3 text-xs text-stone-400">
          Sheets auto-sync every few minutes while the pipeline is open. New leads email the team
          when RESEND_API_KEY is configured.
        </p>
      </div>
    </div>
  )
}
