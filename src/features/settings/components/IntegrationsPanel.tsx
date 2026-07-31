import { useIntegrationStatus } from '../api'

const ORDER: { key: string; label: string }[] = [
  { key: 'ai', label: 'AI Daily Brief' },
  { key: 'transcription', label: 'Voice transcription' },
  { key: 'twilio', label: 'Calls & SMS (Twilio)' },
  { key: 'softphone', label: 'Browser softphone' },
  { key: 'stripe', label: 'Card payments (Stripe)' },
  { key: 'meta', label: 'Messenger / Instagram' },
  { key: 'calendarFeed', label: 'Calendar feed' },
  { key: 'push', label: 'Push notifications' },
]

/** Live integration health (Slice 31) — which secrets are set, never the
 *  values. Secrets themselves are managed in Supabase function config. */
export function IntegrationsPanel() {
  const { data: status, isPending, isError, error } = useIntegrationStatus()

  return (
    <section className="max-w-2xl rounded-lg border border-stone-200 bg-white p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Integrations</h2>
      <p className="mb-3 text-xs text-stone-400">
        Configured in the Supabase function secrets (never in the app). Grey means the feature
        degrades gracefully until its keys are added.
      </p>
      {isPending && <p className="py-2 text-sm text-stone-500">Checking…</p>}
      {isError && <p className="py-2 text-sm text-red-600">Could not check. {error.message}</p>}
      <ul className="divide-y divide-stone-100">
        {status &&
          ORDER.map(({ key, label }) => {
            const info = status[key]
            if (!info) return null
            return (
              <li key={key} className="flex items-start gap-3 py-2.5">
                <span
                  className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                    info.configured ? 'bg-emerald-500' : 'bg-stone-300'
                  }`}
                  title={info.configured ? 'Configured' : 'Not configured'}
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-stone-800">
                    {label}
                    {info.model && info.configured && (
                      <span className="ml-2 text-xs font-normal text-stone-400">{info.model}</span>
                    )}
                    {key === 'meta' && info.configured && !info.sendConfigured && (
                      <span className="ml-2 text-xs font-normal text-amber-700">
                        receive-only (no page token)
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-stone-500">{info.what}</p>
                  {!info.configured && <p className="text-xs text-stone-400">Needs: {info.needs}</p>}
                </div>
              </li>
            )
          })}
      </ul>
    </section>
  )
}
