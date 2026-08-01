import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { useAuth } from '../../auth/AuthProvider'
import { useProfiles } from '../../auth/api'
import { supabase } from '../../../lib/supabase'
import { useCreateTask } from '../../tasks/api'
import { SaraBot } from '../../../components/SaraBot'

// The AI agent's morning briefing (Slice 24, DECISIONS 027): reads leads,
// stages, notes/transcripts, last-contact recency, installs, overdue
// invoices, and open tasks, then recommends who to reach today — each
// recommendation one click from becoming an assigned task on the calendar.

interface UrgentItem {
  contact_id: string | null
  job_id: string | null
  who: string
  job_number: string | null
  category?: string
  reason: string
  action: string
  priority: number
  task_title: string
  due: string
}

interface Brief {
  summary: string
  urgent: UrgentItem[]
}

interface BriefResponse {
  brief: Brief
  for?: { name: string; job_role: string | null }
  usage?: { used: number; cap: number }
}

const CATEGORY_CHIPS: Record<string, string> = {
  outreach: 'bg-blue-100 text-blue-800',
  production: 'bg-purple-100 text-purple-800',
  internal: 'bg-stone-200 text-stone-700',
  money: 'bg-emerald-100 text-emerald-800',
  schedule: 'bg-orange-100 text-orange-800',
}

export function DailyBrief() {
  const generate = useMutation({
    mutationFn: async (): Promise<BriefResponse> => {
      const { data, error } = await supabase.functions.invoke('daily-brief', { body: {} })
      if (error) {
        const context = (error as { context?: Response }).context
        if (context) {
          const parsed = await context.json().catch(() => null)
          if (parsed?.error) throw new Error(parsed.error)
        }
        throw error
      }
      return data as BriefResponse
    },
  })

  return (
    <section className="mb-4 rounded-lg border border-amber-200 bg-amber-50/50 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-amber-800">
          <SaraBot size={30} mood={generate.isPending ? 'thinking' : 'idle'} /> Sara's daily brief
          {generate.data?.for?.job_role && (
            <span className="ml-2 normal-case tracking-normal text-amber-700/70">
              for {generate.data.for.name} · {generate.data.for.job_role}
            </span>
          )}
        </h2>
        <span className="flex items-center gap-2">
          {generate.data?.usage && (
            <span className="text-xs text-amber-700/70">
              {generate.data.usage.cap - generate.data.usage.used} credits left
            </span>
          )}
          <button
            onClick={() => generate.mutate()}
            disabled={generate.isPending}
            className="rounded bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
          >
            {generate.isPending ? 'Sara is reading everything…' : generate.data ? 'Refresh' : 'Sara, plan my day'}
          </button>
        </span>
      </div>
      {generate.isError && (
        <p className="text-sm text-red-600">
          {generate.error.message.includes('configured')
            ? 'Sara needs AI_API_KEY (Kimi/Moonshot or any OpenAI-compatible key) in the function secrets.'
            : generate.error.message}
        </p>
      )}
      {!generate.data && !generate.isPending && !generate.isError && (
        <p className="text-sm text-stone-500">
          Sara reads every lead, note, transcript, install, and overdue invoice — then hands you
          the day's priorities. Ask her follow-ups from the ✨ chat, bottom right.
        </p>
      )}
      {generate.data && (
        <div>
          <p className="mb-3 whitespace-pre-wrap text-sm leading-relaxed text-stone-800">
            {generate.data.brief.summary}
          </p>
          <ul className="space-y-2">
            {generate.data.brief.urgent.map((item, i) => (
              <UrgentRow key={`${item.contact_id}-${i}`} item={item} />
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function UrgentRow({ item }: { item: UrgentItem }) {
  const { session } = useAuth()
  const { data: profiles } = useProfiles()
  const createTask = useCreateTask()
  const [assignee, setAssignee] = useState(session?.user.id ?? '')
  const [added, setAdded] = useState(false)

  const addTask = () => {
    createTask.mutate(
      {
        title: item.task_title,
        job_id: item.job_id,
        assigned_to: assignee || null,
        due_date: item.due,
      },
      { onSuccess: () => setAdded(true) },
    )
  }

  const link = item.job_id
    ? `/jobs/${item.job_id}`
    : item.contact_id
      ? `/contacts/${item.contact_id}`
      : null

  return (
    <li className="rounded border border-stone-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-bold ${
            item.priority <= 2 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'
          }`}
        >
          P{item.priority}
        </span>
        {item.category && (
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${CATEGORY_CHIPS[item.category] ?? 'bg-stone-200 text-stone-700'}`}>
            {item.category}
          </span>
        )}
        {link ? (
          <Link to={link} className="text-sm font-semibold text-stone-900 hover:text-amber-700 hover:underline">
            {item.who}
            {item.job_number ? ` — ${item.job_number}` : ''}
          </Link>
        ) : (
          <span className="text-sm font-semibold text-stone-900">{item.who}</span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          {added ? (
            <span className="text-xs font-medium text-emerald-700">✓ Task on calendar</span>
          ) : (
            <>
              <select
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                className="rounded border border-stone-300 px-1.5 py-1 text-xs"
                aria-label="Assign task to"
              >
                {profiles?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name ?? 'Unnamed'}
                  </option>
                ))}
              </select>
              <button
                onClick={addTask}
                disabled={createTask.isPending}
                className="rounded bg-amber-600 px-2 py-1 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {createTask.isPending ? 'Adding…' : `+ Task ${item.due}`}
              </button>
            </>
          )}
        </div>
      </div>
      <p className="mt-1 text-sm text-stone-700">{item.reason}</p>
      <p className="text-sm font-medium text-stone-900">→ {item.action}</p>
      {createTask.isError && <p className="text-xs text-red-600">{createTask.error.message}</p>}
    </li>
  )
}
