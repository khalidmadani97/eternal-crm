import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import type { JobStage } from '../jobs/api'

// Four numbers, nothing more (ROADMAP Slice 11). Aggregation happens here in
// plain code over narrow selects — each figure reconciles 1:1 with a manual
// SQL query on the same predicates.

export interface StageValue {
  stage: JobStage
  count: number
  value: number
}

/** 1. Pipeline value by stage, current (live jobs only). */
export function usePipelineByStage() {
  return useQuery({
    queryKey: ['reports', 'pipeline'],
    queryFn: async (): Promise<StageValue[]> => {
      const { data, error } = await supabase
        .from('jobs')
        .select('stage, value_est, value_final')
        .is('deleted_at', null)
      if (error) throw error
      const byStage = new Map<JobStage, StageValue>()
      for (const row of data) {
        const entry = byStage.get(row.stage) ?? { stage: row.stage, count: 0, value: 0 }
        entry.count += 1
        entry.value += Number(row.value_final ?? row.value_est) || 0
        byStage.set(row.stage, entry)
      }
      return [...byStage.values()]
    },
  })
}

export interface WinRateRow {
  leadSource: string
  won: number
  lost: number
  open: number
  rate: number | null // null when nothing decided yet
}

/** 2. Win rate by lead_source over jobs created in [from, to]. The number
 *  that decides Meta spend — decided = won or lost; open jobs excluded from
 *  the rate but shown. */
export function useWinRate(from: string, to: string) {
  return useQuery({
    queryKey: ['reports', 'winrate', from, to],
    queryFn: async (): Promise<WinRateRow[]> => {
      const { data, error } = await supabase
        .from('jobs')
        .select('lead_source, won_at, lost_at')
        .is('deleted_at', null)
        .gte('created_at', `${from}T00:00:00Z`)
        .lte('created_at', `${to}T23:59:59Z`)
      if (error) throw error
      const bySource = new Map<string, WinRateRow>()
      for (const row of data) {
        const key = row.lead_source ?? '(none)'
        const entry = bySource.get(key) ?? { leadSource: key, won: 0, lost: 0, open: 0, rate: null }
        if (row.won_at) entry.won += 1
        else if (row.lost_at) entry.lost += 1
        else entry.open += 1
        bySource.set(key, entry)
      }
      for (const entry of bySource.values()) {
        const decided = entry.won + entry.lost
        entry.rate = decided > 0 ? entry.won / decided : null
      }
      return [...bySource.values()].sort((a, b) => b.won + b.lost - (a.won + a.lost))
    },
  })
}

export interface MonthRevenue {
  month: string // YYYY-MM
  invoiced: number
  collected: number
}

/** 3. Revenue by month: invoiced (issued, non-void invoices by issue_date)
 *  vs collected (payments by received_at). */
export function useRevenueByMonth() {
  return useQuery({
    queryKey: ['reports', 'revenue'],
    queryFn: async (): Promise<MonthRevenue[]> => {
      const [invoicesRes, paymentsRes] = await Promise.all([
        supabase
          .from('invoices')
          .select('issue_date, total, status')
          .not('status', 'in', '("draft","void")'),
        supabase.from('payments').select('received_at, amount'),
      ])
      if (invoicesRes.error) throw invoicesRes.error
      if (paymentsRes.error) throw paymentsRes.error
      const months = new Map<string, MonthRevenue>()
      const get = (month: string) => {
        const entry = months.get(month) ?? { month, invoiced: 0, collected: 0 }
        months.set(month, entry)
        return entry
      }
      for (const inv of invoicesRes.data) {
        if (!inv.issue_date) continue
        get(inv.issue_date.slice(0, 7)).invoiced += Number(inv.total) || 0
      }
      for (const p of paymentsRes.data) {
        get(p.received_at.slice(0, 7)).collected += Number(p.amount) || 0
      }
      return [...months.values()].sort((a, b) => a.month.localeCompare(b.month))
    },
  })
}

export interface ReferralRow {
  companyId: string
  companyName: string
  jobs: number
  value: number
}

/** 4. Referral leaderboard: jobs and value by referring company. */
export function useReferralLeaderboard() {
  return useQuery({
    queryKey: ['reports', 'referrals'],
    queryFn: async (): Promise<ReferralRow[]> => {
      const { data, error } = await supabase
        .from('jobs')
        .select('company_id, value_est, value_final, company:companies ( id, name )')
        .not('company_id', 'is', null)
        .is('deleted_at', null)
      if (error) throw error
      const byCompany = new Map<string, ReferralRow>()
      for (const row of data as unknown as {
        company_id: string
        value_est: number | null
        value_final: number | null
        company: { id: string; name: string } | null
      }[]) {
        const entry = byCompany.get(row.company_id) ?? {
          companyId: row.company_id,
          companyName: row.company?.name ?? '(deleted company)',
          jobs: 0,
          value: 0,
        }
        entry.jobs += 1
        entry.value += Number(row.value_final ?? row.value_est) || 0
        byCompany.set(row.company_id, entry)
      }
      return [...byCompany.values()].sort((a, b) => b.value - a.value)
    },
  })
}
