import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../../lib/supabase'
import { formatDateTime } from '../../../lib/format'

// Security & backups (Slice 32). Admin-only tab: run/download full-data
// backups; copies land in the company Google Drive when configured.

interface BackupList {
  backups: { name: string; created_at: string; size: number | null; url: string | null }[]
  driveConfigured: boolean
}

async function invokeBackup(body: object) {
  const { data, error } = await supabase.functions.invoke('backup', { body })
  if (error) {
    const context = (error as { context?: Response }).context
    if (context) {
      const parsed = typeof context?.json === 'function' ? await context.json().catch(() => null) : null
      if (parsed?.error) throw new Error(parsed.error)
    }
    throw error
  }
  return data
}

export function BackupPanel() {
  const queryClient = useQueryClient()
  const list = useQuery({
    queryKey: ['backups'],
    queryFn: async (): Promise<BackupList> => (await invokeBackup({ action: 'list' })) as BackupList,
  })
  const run = useMutation({
    mutationFn: async () => await invokeBackup({ action: 'run' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['backups'] }),
  })

  return (
    <section className="max-w-2xl rounded-lg border border-stone-200 bg-white p-4">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">
          Security &amp; backups
        </h2>
        <button
          onClick={() => run.mutate()}
          disabled={run.isPending}
          className="rounded bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
        >
          {run.isPending ? 'Backing up…' : 'Back up now'}
        </button>
      </div>
      <p className="mb-3 text-xs text-stone-400">
        Full snapshot of every table as JSON into private storage
        {list.data?.driveConfigured
          ? ' — and a copy to the company Google Drive.'
          : '. Add GDRIVE_CLIENT_ID / GDRIVE_CLIENT_SECRET / GDRIVE_REFRESH_TOKEN / GDRIVE_FOLDER_ID to the function secrets to also copy each backup into the company Google Drive.'}
      </p>
      {run.isSuccess && (
        <p className="mb-2 rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Backed up {(run.data as { rows: number }).rows} rows across{' '}
          {(run.data as { tables: number }).tables} tables
          {(run.data as { drive?: { fileId?: string } }).drive?.fileId
            ? ' — copied to Google Drive.'
            : '.'}
        </p>
      )}
      {run.isError && <p className="mb-2 text-sm text-red-600">{run.error.message}</p>}
      {list.isPending && <p className="py-2 text-sm text-stone-500">Loading backups…</p>}
      {list.isError && <p className="py-2 text-sm text-red-600">{list.error.message}</p>}
      {list.data && list.data.backups.length === 0 && (
        <p className="py-2 text-sm text-stone-500">No backups yet — run the first one.</p>
      )}
      <ul className="divide-y divide-stone-100">
        {list.data?.backups.map((b) => (
          <li key={b.name} className="flex items-center justify-between gap-2 py-2 text-sm">
            <span className="min-w-0 truncate text-stone-800">{b.name}</span>
            <span className="shrink-0 text-xs text-stone-400">
              {formatDateTime(b.created_at)}
              {b.size ? ` · ${Math.round(b.size / 1024)} KB` : ''}
            </span>
            {b.url && (
              <a
                href={b.url}
                download
                className="shrink-0 rounded border border-stone-300 px-2 py-1 text-xs text-stone-700 hover:bg-stone-50"
              >
                Download
              </a>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-3 border-t border-stone-100 pt-3 text-xs leading-relaxed text-stone-500">
        <p className="font-medium text-stone-600">Also in force:</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          <li>All customer data behind row-level security; public pages never touch the database directly.</li>
          <li>Company financials (overhead, P&amp;L) are visible to admins only — enforced by the database, not the UI.</li>
          <li>Roles and responsibilities can only be changed by admins, enforced by a database trigger.</li>
          <li>Every webhook is signature-verified; signing links are single-use tokens.</li>
        </ul>
      </div>
    </section>
  )
}
