import { useState } from 'react'
import { Link } from 'react-router-dom'
import { JOB_STAGES } from '../../jobs/api'
import { STAGE_LABELS } from '../../jobs/components/StageBadge'
import { formatCurrency } from '../../../lib/format'
import {
  usePipelineByStage,
  useReferralLeaderboard,
  useRevenueByMonth,
  useWinRate,
} from '../api'

function Panel({
  title,
  isPending,
  isError,
  errorMessage,
  empty,
  children,
}: {
  title: string
  isPending: boolean
  isError: boolean
  errorMessage?: string
  empty: boolean
  children: React.ReactNode
}) {
  return (
    <section className="rounded-lg border border-stone-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">{title}</h2>
      {isPending && <p className="py-4 text-sm text-stone-500">Loading…</p>}
      {isError && <p className="py-4 text-sm text-red-600">Could not load. {errorMessage}</p>}
      {!isPending && !isError && empty && (
        <p className="py-4 text-sm text-stone-500">No data yet.</p>
      )}
      {!isPending && !isError && !empty && children}
    </section>
  )
}

export function ReportsPage() {
  const defaultFrom = new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10)
  const defaultTo = new Date().toISOString().slice(0, 10)
  const [from, setFrom] = useState(defaultFrom)
  const [to, setTo] = useState(defaultTo)

  const pipeline = usePipelineByStage()
  const winRate = useWinRate(from, to)
  const revenue = useRevenueByMonth()
  const referrals = useReferralLeaderboard()

  const maxStageValue = Math.max(1, ...(pipeline.data?.map((s) => s.value) ?? []))

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-stone-900">Reports</h1>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Pipeline value by stage"
          isPending={pipeline.isPending}
          isError={pipeline.isError}
          errorMessage={pipeline.error?.message}
          empty={!pipeline.data?.length}
        >
          <ul className="space-y-1.5">
            {JOB_STAGES.map((stage) => {
              const row = pipeline.data?.find((s) => s.stage === stage)
              if (!row) return null
              return (
                <li key={stage} className="flex items-center gap-2 text-sm">
                  <span className="w-24 shrink-0 text-stone-600">{STAGE_LABELS[stage]}</span>
                  <div className="h-4 flex-1 rounded bg-stone-100">
                    <div
                      className="h-4 rounded bg-amber-600/70"
                      style={{ width: `${(row.value / maxStageValue) * 100}%` }}
                    />
                  </div>
                  <span className="w-24 shrink-0 text-right tabular-nums">
                    {formatCurrency(row.value)}
                  </span>
                  <span className="w-8 shrink-0 text-right text-xs text-stone-400">{row.count}</span>
                </li>
              )
            })}
          </ul>
        </Panel>

        <Panel
          title="Win rate by lead source"
          isPending={winRate.isPending}
          isError={winRate.isError}
          errorMessage={winRate.error?.message}
          empty={!winRate.data?.length}
        >
          <div className="mb-3 flex items-center gap-2 text-sm">
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded border border-stone-300 px-2 py-1 text-sm"
            />
            <span className="text-stone-400">→</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded border border-stone-300 px-2 py-1 text-sm"
            />
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-stone-400">
                <th className="py-1">Source</th>
                <th className="py-1 text-right">Won</th>
                <th className="py-1 text-right">Lost</th>
                <th className="py-1 text-right">Open</th>
                <th className="py-1 text-right">Win rate</th>
              </tr>
            </thead>
            <tbody>
              {winRate.data?.map((row) => (
                <tr key={row.leadSource} className="border-t border-stone-100">
                  <td className="py-1.5">{row.leadSource}</td>
                  <td className="py-1.5 text-right tabular-nums">{row.won}</td>
                  <td className="py-1.5 text-right tabular-nums">{row.lost}</td>
                  <td className="py-1.5 text-right tabular-nums">{row.open}</td>
                  <td className="py-1.5 text-right font-medium tabular-nums">
                    {row.rate === null ? '—' : `${Math.round(row.rate * 100)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel
          title="Revenue by month — invoiced vs collected"
          isPending={revenue.isPending}
          isError={revenue.isError}
          errorMessage={revenue.error?.message}
          empty={!revenue.data?.length}
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-stone-400">
                <th className="py-1">Month</th>
                <th className="py-1 text-right">Invoiced</th>
                <th className="py-1 text-right">Collected</th>
              </tr>
            </thead>
            <tbody>
              {revenue.data?.map((row) => (
                <tr key={row.month} className="border-t border-stone-100">
                  <td className="py-1.5">{row.month}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatCurrency(row.invoiced)}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatCurrency(row.collected)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel
          title="Referral leaderboard"
          isPending={referrals.isPending}
          isError={referrals.isError}
          errorMessage={referrals.error?.message}
          empty={!referrals.data?.length}
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-stone-400">
                <th className="py-1">Company</th>
                <th className="py-1 text-right">Jobs</th>
                <th className="py-1 text-right">Referred value</th>
              </tr>
            </thead>
            <tbody>
              {referrals.data?.map((row) => (
                <tr key={row.companyId} className="border-t border-stone-100">
                  <td className="py-1.5">
                    <Link to={`/companies/${row.companyId}`} className="text-amber-700 hover:underline">
                      {row.companyName}
                    </Link>
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{row.jobs}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatCurrency(row.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </div>
  )
}
