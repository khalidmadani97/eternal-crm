import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../auth/AuthProvider'
import { supabase } from '../../../lib/supabase'
import { StageBadge } from '../../jobs/components/StageBadge'
import type { JobStage } from '../../jobs/api'
import { formatAgo, formatCurrency, formatDate, formatPhone, normalizePhone } from '../../../lib/format'
import { useTeam } from '../api'

// The employee card (Slice 31): identity, company role (SET BY AN ADMIN —
// read-only here for staff), self-editable contact details, and "my work":
// assigned jobs, open tasks, AI meter.

function useMyWork(userId: string | undefined) {
  return useQuery({
    queryKey: ['my-work', userId],
    enabled: !!userId,
    queryFn: async () => {
      const monthStart = new Date()
      monthStart.setUTCDate(1)
      monthStart.setUTCHours(0, 0, 0, 0)
      const [jobsRes, tasksRes, usageRes, allowanceRes] = await Promise.all([
        supabase
          .from('jobs')
          .select('id, job_number, title, stage, value_est, value_final, contact:contacts(full_name, last_contacted_at)')
          .eq('assigned_to', userId!)
          .is('deleted_at', null)
          .not('stage', 'in', '(closed,lost)')
          .order('created_at', { ascending: false }),
        supabase
          .from('tasks')
          .select('id, title, due_date, job:jobs(id, job_number)')
          .eq('assigned_to', userId!)
          .is('completed_at', null)
          .order('due_date', { ascending: true, nullsFirst: false }),
        supabase
          .from('ai_usage')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId!)
          .gte('created_at', monthStart.toISOString()),
        supabase
          .from('ai_allowances')
          .select('monthly_prompts, extra_prompts')
          .eq('user_id', userId!)
          .maybeSingle(),
      ])
      if (jobsRes.error) throw jobsRes.error
      if (tasksRes.error) throw tasksRes.error
      const cap = allowanceRes.data
        ? allowanceRes.data.monthly_prompts + allowanceRes.data.extra_prompts
        : 60
      return {
        jobs: jobsRes.data as unknown as {
          id: string
          job_number: string
          title: string
          stage: JobStage
          value_est: number | null
          value_final: number | null
          contact: { full_name: string; last_contacted_at: string | null } | null
        }[],
        tasks: tasksRes.data as unknown as {
          id: string
          title: string
          due_date: string | null
          job: { id: string; job_number: string } | null
        }[],
        aiUsed: usageRes.count ?? 0,
        aiCap: cap,
      }
    },
  })
}

export function ProfilePage() {
  const { session } = useAuth()
  const { data: team } = useTeam()
  const me = team?.find((m) => m.id === session?.user.id)
  const isAdmin = me?.role === 'admin'
  const work = useMyWork(session?.user.id)

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [saved, setSaved] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)

  const { data: myPhone } = useQuery({
    queryKey: ['my-phone', session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('phone')
        .eq('id', session!.user.id)
        .single()
      if (error) throw error
      return data.phone as string | null
    },
  })

  useEffect(() => {
    if (me) setName(me.full_name ?? '')
  }, [me])
  useEffect(() => {
    if (myPhone !== undefined) setPhone(myPhone ?? '')
  }, [myPhone])

  if (!session || !me) return <p className="py-12 text-center text-stone-500">Loading profile…</p>

  const saveIdentity = async () => {
    const normalized = phone.trim() ? normalizePhone(phone) : null
    if (phone.trim() && !normalized) {
      setValidationError('Enter a valid phone number')
      return
    }
    setValidationError(null)
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: name.trim() || me.full_name, phone: normalized })
      .eq('id', me.id)
    if (error) {
      setValidationError(error.message)
      return
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const initials = (me.full_name ?? '?')
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <div>
      <div className="mb-4 flex items-center gap-4">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-stone-900 text-lg font-semibold text-amber-400">
          {initials}
        </span>
        <div>
          <h1 className="text-xl font-semibold text-stone-900">{me.full_name ?? 'Unnamed'}</h1>
          <p className="text-sm text-stone-500">
            {me.job_role ?? 'No company role set'} · {me.role === 'admin' ? 'Administrator' : 'Staff'}
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[24rem_1fr]">
        <div className="space-y-4">
          <section className="rounded-lg border border-stone-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">
              My details
            </h2>
            <div className="space-y-3">
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-stone-700">Name</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded border border-stone-300 px-3 py-2 text-sm focus:border-amber-600 focus:outline-none"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-stone-700">Direct phone</span>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(416) 555-1234"
                  className="w-full rounded border border-stone-300 px-3 py-2 text-sm focus:border-amber-600 focus:outline-none"
                />
                <span className="mt-1 block text-xs text-stone-400">
                  Used as the default “from” when you log a call made from your cell.
                </span>
              </label>
              <div className="text-sm">
                <span className="mb-1 block font-medium text-stone-700">Email</span>
                <p className="text-stone-600">{session.user.email}</p>
              </div>
              <div className="text-sm">
                <span className="mb-1 block font-medium text-stone-700">Company role</span>
                <p className="text-stone-600">
                  {me.job_role ?? '—'}
                  {!isAdmin && (
                    <span className="ml-2 text-xs text-stone-400">set by your admin</span>
                  )}
                  {isAdmin && (
                    <Link to="/settings" className="ml-2 text-xs text-amber-700 hover:underline">
                      edit in Settings → Team
                    </Link>
                  )}
                </p>
              </div>
              <div className="text-sm">
                <span className="mb-1 block font-medium text-stone-700">Responsibilities</span>
                <p className="whitespace-pre-wrap text-xs leading-relaxed text-stone-600">
                  {me.responsibilities ?? 'Not set — the Daily Brief assumes you oversee everything.'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => void saveIdentity()}
                  className="rounded bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800"
                >
                  Save
                </button>
                {saved && <span className="text-sm text-emerald-700">Saved.</span>}
                {validationError && <span className="text-sm text-red-600">{validationError}</span>}
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-stone-200 bg-white p-4">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-500">
              My AI credits
            </h2>
            {work.data && (
              <>
                <div className="mb-1 h-3 overflow-hidden rounded-full bg-stone-100">
                  <div
                    className={`h-3 ${
                      work.data.aiUsed >= work.data.aiCap ? 'bg-red-500' : 'bg-emerald-500'
                    }`}
                    style={{
                      width: `${Math.min(100, Math.round((work.data.aiUsed / Math.max(work.data.aiCap, 1)) * 100))}%`,
                    }}
                  />
                </div>
                <p className="text-xs tabular-nums text-stone-500">
                  {work.data.aiUsed} of {work.data.aiCap} used this month
                </p>
              </>
            )}
          </section>
        </div>

        <div className="space-y-4">
          <section className="rounded-lg border border-stone-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">
              My jobs ({work.data?.jobs.length ?? '…'})
            </h2>
            {work.isPending && <p className="text-sm text-stone-500">Loading…</p>}
            {work.isError && <p className="text-sm text-red-600">Could not load. {work.error.message}</p>}
            {work.data && work.data.jobs.length === 0 && (
              <p className="text-sm text-stone-500">Nothing assigned to you right now.</p>
            )}
            <ul className="divide-y divide-stone-100">
              {work.data?.jobs.map((j) => (
                <li key={j.id} className="flex items-center gap-3 py-2 text-sm">
                  <Link to={`/jobs/${j.id}`} className="font-medium text-stone-900 hover:text-amber-700 hover:underline">
                    {j.job_number}
                  </Link>
                  <span className="min-w-0 flex-1 truncate text-stone-600">{j.title}</span>
                  <StageBadge stage={j.stage} />
                  <span className="w-20 text-right text-xs text-stone-400">
                    {j.contact?.last_contacted_at ? `${formatAgo(j.contact.last_contacted_at)} ago` : 'no contact'}
                  </span>
                  <span className="w-24 text-right tabular-nums">
                    {formatCurrency(j.value_final ?? j.value_est)}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-lg border border-stone-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">
              My open tasks ({work.data?.tasks.length ?? '…'})
            </h2>
            {work.data && work.data.tasks.length === 0 && (
              <p className="text-sm text-stone-500">No open tasks. 🎉</p>
            )}
            <ul className="space-y-1.5">
              {work.data?.tasks.map((t) => {
                const late = !!t.due_date && t.due_date < new Date().toISOString().slice(0, 10)
                return (
                  <li key={t.id} className="flex items-center justify-between text-sm">
                    <span className="min-w-0 truncate">
                      {t.title}
                      {t.job && (
                        <Link to={`/jobs/${t.job.id}`} className="ml-2 text-xs text-amber-700 hover:underline">
                          {t.job.job_number}
                        </Link>
                      )}
                    </span>
                    <span className={`text-xs ${late ? 'font-semibold text-red-600' : 'text-stone-400'}`}>
                      {t.due_date ? formatDate(t.due_date) : '—'}
                    </span>
                  </li>
                )
              })}
            </ul>
            <Link to="/tasks" className="mt-2 block text-xs text-amber-700 hover:underline">
              All tasks →
            </Link>
          </section>

          <p className="text-xs text-stone-400">
            Direct line on file: {formatPhone(myPhone)} · Permission level: {me.role}
          </p>
        </div>
      </div>
    </div>
  )
}
