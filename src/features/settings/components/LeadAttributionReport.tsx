import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../../lib/supabase'

const RANGES = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
  { label: 'All time', days: 0 },
]

interface LeadRow {
  id: string
  provider: string | null
  ad_id: string | null
  campaign_id: string | null
  adset_id: string | null
  form_id: string | null
  job_id: string | null
  converted_at: string | null
  created_at: string
}

function useLeadAttribution(days: number) {
  return useQuery({
    queryKey: ['lead-attribution', days],
    queryFn: async (): Promise<LeadRow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any)
        .from('inbound_leads')
        .select('id, provider, ad_id, campaign_id, adset_id, form_id, job_id, converted_at, created_at')
        .order('created_at', { ascending: false })
        .limit(1000)
      if (days > 0) {
        const since = new Date(Date.now() - days * 86400_000).toISOString()
        q = q.gte('created_at', since)
      }
      const { data, error } = await q
      if (error) throw error
      return data as LeadRow[]
    },
    staleTime: 60_000,
  })
}

function groupBy<T>(arr: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const item of arr) {
    const k = key(item)
    const bucket = map.get(k)
    if (bucket) bucket.push(item)
    else map.set(k, [item])
  }
  return map
}

function ProviderBadge({ provider }: { provider: string | null }) {
  const label =
    provider === 'meta_lead_form' ? 'Meta Lead Ad'
    : provider === 'google_lead_form' ? 'Google Lead Form'
    : provider === 'manual' ? 'Manual'
    : provider ?? '—'
  const cls =
    provider === 'meta_lead_form' ? 'bg-blue-50 text-blue-700'
    : provider === 'google_lead_form' ? 'bg-green-50 text-green-700'
    : 'bg-stone-100 text-stone-600'
  return <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}>{label}</span>
}

function statLine(leads: LeadRow[]) {
  const qualified = leads.filter((l) => l.job_id).length
  return { total: leads.length, qualified }
}

export function LeadAttributionReport() {
  const [rangeIdx, setRangeIdx] = useState(1)
  const { days } = RANGES[rangeIdx]
  const { data, isPending, isError, error } = useLeadAttribution(days)

  if (isPending) return <p className="py-4 text-sm text-stone-500">Loading…</p>
  if (isError) return <p className="py-4 text-sm text-red-600">{(error as Error).message}</p>

  const byProvider = groupBy(data, (l) => l.provider ?? 'unknown')
  const byCampaign = groupBy(data.filter((l) => l.campaign_id), (l) => l.campaign_id!)
  const byAd = groupBy(data.filter((l) => l.ad_id), (l) => l.ad_id!)

  // Sort by total descending
  const campaignRows = [...byCampaign.entries()].sort((a, b) => b[1].length - a[1].length)
  const adRows = [...byAd.entries()].sort((a, b) => b[1].length - a[1].length)
  const providerRows = [...byProvider.entries()].sort((a, b) => b[1].length - a[1].length)

  const total = data.length
  const totalQualified = data.filter((l) => l.job_id).length

  return (
    <div className="space-y-6">
      {/* Range selector */}
      <div className="flex gap-1">
        {RANGES.map((r, i) => (
          <button
            key={r.label}
            onClick={() => setRangeIdx(i)}
            className={`rounded border px-3 py-1.5 text-xs font-medium transition-colors ${
              i === rangeIdx
                ? 'border-amber-600 bg-amber-50 text-amber-700'
                : 'border-stone-200 bg-white text-stone-500 hover:bg-stone-50'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Total leads', value: total },
          { label: 'Qualified (job created)', value: totalQualified },
          { label: 'Qualification rate', value: total ? `${Math.round((totalQualified / total) * 100)}%` : '—' },
          { label: 'Sources', value: byProvider.size },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-stone-200 bg-white p-3">
            <p className="text-xs text-stone-500">{s.label}</p>
            <p className="mt-1 text-2xl font-semibold text-stone-900">{s.value}</p>
          </div>
        ))}
      </div>

      {total === 0 ? (
        <p className="rounded-lg border border-stone-200 bg-white p-6 text-center text-sm text-stone-500">
          No leads in this period. Connect Meta Lead Ads or Google Lead Form Extensions in the Ad tracking tab.
        </p>
      ) : (
        <>
          {/* By source */}
          <section className="max-w-2xl rounded-lg border border-stone-200 bg-white">
            <h2 className="border-b border-stone-100 px-4 py-3 text-sm font-semibold text-stone-700">
              By source
            </h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-100 text-xs text-stone-400">
                  <th className="px-4 py-2 text-left font-medium">Source</th>
                  <th className="px-4 py-2 text-right font-medium">Leads</th>
                  <th className="px-4 py-2 text-right font-medium">Qualified</th>
                  <th className="px-4 py-2 text-right font-medium">Rate</th>
                </tr>
              </thead>
              <tbody>
                {providerRows.map(([provider, leads]) => {
                  const s = statLine(leads)
                  return (
                    <tr key={provider} className="border-b border-stone-50">
                      <td className="px-4 py-2.5">
                        <ProviderBadge provider={provider === 'unknown' ? null : provider} />
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{s.total}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{s.qualified}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-stone-500">
                        {s.total ? `${Math.round((s.qualified / s.total) * 100)}%` : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>

          {/* By campaign */}
          {campaignRows.length > 0 && (
            <section className="max-w-2xl rounded-lg border border-stone-200 bg-white">
              <h2 className="border-b border-stone-100 px-4 py-3 text-sm font-semibold text-stone-700">
                By campaign
              </h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-100 text-xs text-stone-400">
                    <th className="px-4 py-2 text-left font-medium">Campaign ID</th>
                    <th className="px-4 py-2 text-right font-medium">Leads</th>
                    <th className="px-4 py-2 text-right font-medium">Qualified</th>
                    <th className="px-4 py-2 text-right font-medium">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {campaignRows.map(([cid, leads]) => {
                    const s = statLine(leads)
                    const sources = [...new Set(leads.map((l) => l.provider))]
                    return (
                      <tr key={cid} className="border-b border-stone-50">
                        <td className="px-4 py-2.5">
                          <code className="text-xs text-stone-700">{cid}</code>
                          <div className="mt-0.5 flex gap-1">
                            {sources.map((p) => <ProviderBadge key={p} provider={p} />)}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{s.total}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{s.qualified}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-stone-500">
                          {s.total ? `${Math.round((s.qualified / s.total) * 100)}%` : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </section>
          )}

          {/* By ad */}
          {adRows.length > 0 && (
            <section className="max-w-2xl rounded-lg border border-stone-200 bg-white">
              <h2 className="border-b border-stone-100 px-4 py-3 text-sm font-semibold text-stone-700">
                By ad
              </h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-100 text-xs text-stone-400">
                    <th className="px-4 py-2 text-left font-medium">Ad ID</th>
                    <th className="px-4 py-2 text-right font-medium">Leads</th>
                    <th className="px-4 py-2 text-right font-medium">Qualified</th>
                    <th className="px-4 py-2 text-right font-medium">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {adRows.map(([aid, leads]) => {
                    const s = statLine(leads)
                    const sources = [...new Set(leads.map((l) => l.provider))]
                    return (
                      <tr key={aid} className="border-b border-stone-50">
                        <td className="px-4 py-2.5">
                          <code className="text-xs text-stone-700">{aid}</code>
                          <div className="mt-0.5 flex gap-1">
                            {sources.map((p) => <ProviderBadge key={p} provider={p} />)}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{s.total}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{s.qualified}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-stone-500">
                          {s.total ? `${Math.round((s.qualified / s.total) * 100)}%` : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </section>
          )}
        </>
      )}
    </div>
  )
}
