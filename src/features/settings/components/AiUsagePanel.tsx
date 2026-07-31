import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../auth/AuthProvider'
import { supabase } from '../../../lib/supabase'
import { useTeam } from '../api'

// AI usage & credits (Slice 30). Everyone sees the meters; admins adjust
// allowances and grant extra credits. Card-payment top-ups can hook into the
// same extra_prompts grant later.

interface UsageRow {
  userId: string
  used: number
  monthly: number
  extra: number
}

function useAiUsage() {
  return useQuery({
    queryKey: ['ai-usage'],
    queryFn: async (): Promise<Map<string, UsageRow>> => {
      const monthStart = new Date()
      monthStart.setUTCDate(1)
      monthStart.setUTCHours(0, 0, 0, 0)
      const [usageRes, allowanceRes] = await Promise.all([
        supabase.from('ai_usage').select('user_id').gte('created_at', monthStart.toISOString()),
        supabase.from('ai_allowances').select('user_id, monthly_prompts, extra_prompts'),
      ])
      if (usageRes.error) throw usageRes.error
      if (allowanceRes.error) throw allowanceRes.error
      const map = new Map<string, UsageRow>()
      for (const a of allowanceRes.data) {
        map.set(a.user_id, { userId: a.user_id, used: 0, monthly: a.monthly_prompts, extra: a.extra_prompts })
      }
      for (const u of usageRes.data) {
        const row = map.get(u.user_id) ?? { userId: u.user_id, used: 0, monthly: 60, extra: 0 }
        row.used += 1
        map.set(u.user_id, row)
      }
      return map
    },
    refetchInterval: 30_000,
  })
}

function useGrantCredits() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      userId,
      patch,
    }: {
      userId: string
      patch: Partial<{ monthly_prompts: number; extra_prompts: number }>
    }) => {
      const { error } = await supabase
        .from('ai_allowances')
        .upsert({ user_id: userId, ...patch }, { onConflict: 'user_id' })
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['ai-usage'] }),
  })
}

export function AiUsagePanel() {
  const { session } = useAuth()
  const { data: team } = useTeam()
  const { data: usage, isPending, isError, error } = useAiUsage()
  const grant = useGrantCredits()
  const isAdmin = team?.find((m) => m.id === session?.user.id)?.role === 'admin'

  return (
    <section className="rounded-lg border border-stone-200 bg-white p-4 lg:col-span-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">AI usage</h2>
      <p className="mb-3 text-xs text-stone-400">
        Daily Briefs and voice transcriptions count against a monthly credit allowance per person.
        {isAdmin && ' As admin you can raise allowances or grant extra credits for this month.'}
      </p>
      {isPending && <p className="py-2 text-sm text-stone-500">Loading usage…</p>}
      {isError && <p className="py-2 text-sm text-red-600">Could not load usage. {error.message}</p>}
      <div className="space-y-3">
        {team?.map((member) => {
          const row = usage?.get(member.id) ?? { userId: member.id, used: 0, monthly: 60, extra: 0 }
          const cap = row.monthly + row.extra
          const pct = Math.min(100, Math.round((row.used / Math.max(cap, 1)) * 100))
          return (
            <div key={member.id} className="flex flex-wrap items-center gap-3">
              <span className="w-40 truncate text-sm font-medium text-stone-800">
                {member.full_name ?? 'Unnamed'}
              </span>
              <div className="h-3 min-w-40 flex-1 overflow-hidden rounded-full bg-stone-100">
                <div
                  className={`h-3 ${pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="w-24 text-right text-xs tabular-nums text-stone-500">
                {row.used} / {cap} used
              </span>
              {isAdmin && (
                <span className="flex items-center gap-1.5 text-xs">
                  <label className="text-stone-400">monthly</label>
                  <input
                    type="number"
                    defaultValue={row.monthly}
                    min={0}
                    onBlur={(e) => {
                      const v = Number(e.target.value)
                      if (!Number.isNaN(v) && v !== row.monthly)
                        grant.mutate({ userId: member.id, patch: { monthly_prompts: v } })
                    }}
                    className="w-16 rounded border border-stone-300 px-1.5 py-1 text-xs"
                  />
                  <button
                    onClick={() =>
                      grant.mutate({ userId: member.id, patch: { extra_prompts: row.extra + 25 } })
                    }
                    disabled={grant.isPending}
                    className="rounded border border-amber-300 bg-amber-50 px-2 py-1 font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                  >
                    +25 credits
                  </button>
                  {row.extra > 0 && <span className="text-stone-400">(+{row.extra} extra)</span>}
                </span>
              )}
            </div>
          )
        })}
      </div>
      {grant.isError && <p className="mt-2 text-sm text-red-600">{grant.error.message}</p>}
    </section>
  )
}
