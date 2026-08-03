import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../../lib/supabase'
import { formatCurrency, formatDate } from '../../../lib/format'
import { APPT_KIND_LABELS, APPT_KIND_STYLES, useAppointments } from '../../schedule/api'
import { usePipelineByStage } from '../../reports/api'
import { StageBadge } from '../../jobs/components/StageBadge'
import type { JobStage } from '../../jobs/api'
import { DailyBrief } from '../components/DailyBrief'
import { SaraBot } from '../../../components/SaraBot'
import { useTeam } from '../../settings/api'

// The morning screen: what needs attention today, without hunting for it.

function useOverdueInvoices() {
  return useQuery({
    queryKey: ['dashboard', 'overdue'],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10)
      const { data, error } = await supabase
        .from('invoices')
        .select('id, invoice_number, due_date, total, amount_paid, job:jobs(id, title, contact:contacts(full_name))')
        .in('status', ['sent', 'partial'])
        .lt('due_date', today)
        .order('due_date')
      if (error) throw error
      return data as unknown as {
        id: string
        invoice_number: string
        due_date: string
        total: number
        amount_paid: number
        job: { id: string; title: string; contact: { full_name: string } | null } | null
      }[]
    },
  })
}

function useDueTasks() {
  return useQuery({
    queryKey: ['dashboard', 'tasks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('id, title, due_date, job:jobs(id, job_number, title)')
        .is('completed_at', null)
        .not('due_date', 'is', null)
        .order('due_date')
        .limit(8)
      if (error) throw error
      return data as unknown as {
        id: string
        title: string
        due_date: string
        job: { id: string; job_number: string; title: string } | null
      }[]
    },
  })
}

function useStaleJobs() {
  return useQuery({
    queryKey: ['dashboard', 'stale'],
    queryFn: async () => {
      // Leads going cold: early-stage jobs untouched for 7+ days.
      const cutoff = new Date(Date.now() - 7 * 24 * 3600_000).toISOString()
      const { data, error } = await supabase
        .from('jobs')
        .select('id, job_number, title, stage, updated_at, contact:contacts(full_name)')
        .in('stage', ['new', 'contacted', 'quoted', 'follow_up'])
        .is('deleted_at', null)
        .lt('updated_at', cutoff)
        .order('updated_at')
        .limit(6)
      if (error) throw error
      return data as unknown as {
        id: string
        job_number: string
        title: string
        stage: JobStage
        updated_at: string
        contact: { full_name: string } | null
      }[]
    },
  })
}

function timeOfDay(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export function HomePage() {
  const now = new Date()
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dayEnd = new Date(dayStart)
  dayEnd.setDate(dayEnd.getDate() + 1)
  const today = useAppointments(dayStart.toISOString(), dayEnd.toISOString())
  const { session } = useAuth()
  const { data: team } = useTeam()
  const firstName = (team?.find((m) => m.id === session?.user.id)?.full_name ?? '')
    .split(' ')[0]
  const overdue = useOverdueInvoices()
  const tasks = useDueTasks()
  const stale = useStaleJobs()
  const pipeline = usePipelineByStage()

  const openPipeline = pipeline.data
    ?.filter((s) => !['closed', 'lost', 'installed'].includes(s.stage))
    .reduce((sum, s) => sum + s.value, 0)
  const overdueTotal = overdue.data?.reduce(
    (sum, inv) => sum + (Number(inv.total) - Number(inv.amount_paid)),
    0,
  )

  const apptsToday = today.data?.length ?? 0
  const overdueCount = overdue.data?.length ?? 0
  const tasksDueToday =
    tasks.data?.filter((t) => t.due_date === now.toISOString().slice(0, 10)).length ?? 0

  return (
    <div>
      {/* Hero — Sara greets you personally */}
      <div className="mb-4 overflow-hidden rounded-2xl bg-gradient-to-br from-stone-900 via-stone-900 to-violet-950 p-4 text-white shadow-lg sm:p-6">
        <div className="flex flex-wrap items-center gap-5">
          <div className="shrink-0 rounded-full bg-white/95 p-1 shadow-lg ring-2 ring-violet-400/60">
            <SaraBot size={72} mood="happy" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xl font-semibold">
              {timeOfDay()}
              {firstName ? `, ${firstName}` : ''}! <span className="align-middle">👋</span>
            </p>
            <p className="mt-0.5 text-sm text-stone-300">
              {now.toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' })} —{' '}
              {apptsToday > 0
                ? `${apptsToday} appointment${apptsToday === 1 ? '' : 's'} today`
                : 'nothing on the calendar today'}
              {overdueCount > 0 && `, ${overdueCount} overdue invoice${overdueCount === 1 ? '' : 's'}`}
              {tasksDueToday > 0 && `, ${tasksDueToday} task${tasksDueToday === 1 ? '' : 's'} due`}
              . Ask me to plan your day below, or ping me anytime from the bubble. — Sara
            </p>
          </div>
          <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-4">
            <HeroStat label="Pipeline" value={formatCurrency(openPipeline ?? 0)} />
            <HeroStat
              label="Overdue"
              value={formatCurrency(overdueTotal ?? 0)}
              alarm={(overdueTotal ?? 0) > 0}
            />
            <HeroStat label="Today" value={`${apptsToday} appt${apptsToday === 1 ? '' : 's'}`} />
            <HeroStat label="Tasks due" value={String(tasksDueToday)} />
          </div>
        </div>
      </div>

      <DailyBrief />

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-stone-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">
            Today
          </h2>
          {today.isPending && <p className="text-sm text-stone-500">Loading…</p>}
          {today.isError && <p className="text-sm text-red-600">Could not load. {today.error.message}</p>}
          {today.data && today.data.length === 0 && (
            <p className="text-sm text-stone-500">Nothing scheduled today.</p>
          )}
          <ul className="space-y-2">
            {today.data?.map((a) => (
              <li key={a.id} className={`rounded border px-3 py-2 text-sm ${APPT_KIND_STYLES[a.kind]}`}>
                <span className="font-medium">
                  {new Date(a.starts_at).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' })}{' '}
                  {APPT_KIND_LABELS[a.kind]}
                </span>
                {a.job && (
                  <Link to={`/jobs/${a.job.id}`} className="ml-2 hover:underline">
                    {a.job.job_number} — {a.job.contact?.full_name ?? a.job.title}
                  </Link>
                )}
              </li>
            ))}
          </ul>
          <Link to="/calendar" className="mt-3 block text-xs text-amber-700 hover:underline">
            Full calendar →
          </Link>
        </section>

        <section className="rounded-lg border border-stone-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">
            Overdue invoices
          </h2>
          {overdue.isPending && <p className="text-sm text-stone-500">Loading…</p>}
          {overdue.isError && (
            <p className="text-sm text-red-600">Could not load. {overdue.error.message}</p>
          )}
          {overdue.data && overdue.data.length === 0 && (
            <p className="text-sm text-stone-500">Nothing overdue. 🎉</p>
          )}
          <ul className="space-y-2">
            {overdue.data?.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between text-sm">
                <span className="min-w-0">
                  <Link to={`/invoices/${inv.id}`} className="font-medium text-stone-900 hover:text-amber-700 hover:underline">
                    {inv.invoice_number}
                  </Link>
                  <span className="ml-2 text-stone-500">
                    {inv.job?.contact?.full_name ?? inv.job?.title ?? ''}
                  </span>
                  <span className="ml-2 text-xs text-red-600">due {formatDate(inv.due_date)}</span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-red-700">
                  {formatCurrency(Number(inv.total) - Number(inv.amount_paid))}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-lg border border-stone-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">
            Tasks due
          </h2>
          {tasks.isPending && <p className="text-sm text-stone-500">Loading…</p>}
          {tasks.isError && <p className="text-sm text-red-600">Could not load. {tasks.error.message}</p>}
          {tasks.data && tasks.data.length === 0 && (
            <p className="text-sm text-stone-500">No open tasks with due dates.</p>
          )}
          <ul className="space-y-2">
            {tasks.data?.map((t) => {
              const late = t.due_date < new Date().toISOString().slice(0, 10)
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
                  <span className={`shrink-0 text-xs ${late ? 'font-semibold text-red-600' : 'text-stone-400'}`}>
                    {formatDate(t.due_date)}
                  </span>
                </li>
              )
            })}
          </ul>
        </section>

        <section className="rounded-lg border border-stone-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">
            Leads going cold <span className="normal-case text-stone-400">(no touch in 7+ days)</span>
          </h2>
          {stale.isPending && <p className="text-sm text-stone-500">Loading…</p>}
          {stale.isError && <p className="text-sm text-red-600">Could not load. {stale.error.message}</p>}
          {stale.data && stale.data.length === 0 && (
            <p className="text-sm text-stone-500">Every open lead has recent activity.</p>
          )}
          <ul className="space-y-2">
            {stale.data?.map((j) => (
              <li key={j.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">
                  <Link to={`/jobs/${j.id}`} className="font-medium text-stone-900 hover:text-amber-700 hover:underline">
                    {j.job_number}
                  </Link>
                  <span className="ml-2 text-stone-500">{j.contact?.full_name ?? j.title}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <StageBadge stage={j.stage} />
                  <span className="text-xs text-stone-400">{formatDate(j.updated_at)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}

function HeroStat({ label, value, alarm }: { label: string; value: string; alarm?: boolean }) {
  return (
    <div className="rounded-xl bg-white/10 px-3 py-2 backdrop-blur">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">{label}</p>
      <p className={`text-sm font-bold tabular-nums ${alarm ? 'text-red-300' : 'text-white'}`}>
        {value}
      </p>
    </div>
  )
}
