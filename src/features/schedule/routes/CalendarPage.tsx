import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useProfiles } from '../../auth/api'
import {
  APPT_KIND_LABELS,
  APPT_KIND_STYLES,
  APPT_KINDS,
  useAppointments,
  useRescheduleAppointment,
} from '../api'
import type { AppointmentRow } from '../api'
import { AppointmentDialog } from '../components/AppointmentDialog'

type ViewMode = 'month' | 'week'

/** Local YYYY-MM-DD for a Date. */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function startOfWeek(d: Date): Date {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  copy.setDate(copy.getDate() - copy.getDay())
  return copy
}

export function CalendarPage() {
  const [view, setView] = useState<ViewMode>('month')
  const [cursor, setCursor] = useState(() => new Date())
  const [assigneeFilter, setAssigneeFilter] = useState('all')
  const [createOn, setCreateOn] = useState<string | null>(null)
  const { data: profiles } = useProfiles()
  const reschedule = useRescheduleAppointment()
  const [dragged, setDragged] = useState<AppointmentRow | null>(null)

  // Visible range: the full grid for month view, the week for week view.
  const { rangeStart, rangeEnd, days } = useMemo(() => {
    if (view === 'month') {
      const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
      const gridStart = startOfWeek(first)
      const list: Date[] = []
      for (let i = 0; i < 42; i++) {
        const d = new Date(gridStart)
        d.setDate(gridStart.getDate() + i)
        list.push(d)
      }
      const end = new Date(list[41])
      end.setDate(end.getDate() + 1)
      return { rangeStart: gridStart, rangeEnd: end, days: list }
    }
    const weekStart = startOfWeek(cursor)
    const list: Date[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart)
      d.setDate(weekStart.getDate() + i)
      list.push(d)
    }
    const end = new Date(weekStart)
    end.setDate(end.getDate() + 7)
    return { rangeStart: weekStart, rangeEnd: end, days: list }
  }, [view, cursor])

  const { data: appointments, isPending, isError, error, refetch } = useAppointments(
    rangeStart.toISOString(),
    rangeEnd.toISOString(),
  )

  const byDay = useMemo(() => {
    const map = new Map<string, AppointmentRow[]>()
    appointments?.forEach((a) => {
      if (assigneeFilter === 'all' || a.assignee?.id === assigneeFilter) {
        const key = dayKey(new Date(a.starts_at))
        map.set(key, [...(map.get(key) ?? []), a])
      }
    })
    return map
  }, [appointments, assigneeFilter])

  const dropOn = (day: Date) => {
    if (!dragged) return
    const oldStart = new Date(dragged.starts_at)
    const newStart = new Date(
      day.getFullYear(),
      day.getMonth(),
      day.getDate(),
      oldStart.getHours(),
      oldStart.getMinutes(),
    )
    const delta = newStart.getTime() - oldStart.getTime()
    if (delta === 0) return
    const newEnd = dragged.ends_at
      ? new Date(new Date(dragged.ends_at).getTime() + delta).toISOString()
      : null
    reschedule.mutate({ id: dragged.id, startsAt: newStart.toISOString(), endsAt: newEnd })
    setDragged(null)
  }

  const monthLabel = cursor.toLocaleDateString('en-CA', { month: 'long', year: 'numeric' })
  const move = (dir: -1 | 1) => {
    const next = new Date(cursor)
    if (view === 'month') next.setMonth(next.getMonth() + dir)
    else next.setDate(next.getDate() + 7 * dir)
    setCursor(next)
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold text-stone-900">Calendar</h1>
        <div className="flex items-center gap-1">
          <button onClick={() => move(-1)} className="rounded border border-stone-300 px-2 py-1 text-sm hover:bg-stone-50">←</button>
          <button onClick={() => setCursor(new Date())} className="rounded border border-stone-300 px-2 py-1 text-sm hover:bg-stone-50">Today</button>
          <button onClick={() => move(1)} className="rounded border border-stone-300 px-2 py-1 text-sm hover:bg-stone-50">→</button>
        </div>
        <span className="text-sm font-medium text-stone-700">{monthLabel}</span>
        <div className="flex rounded border border-stone-300 text-sm">
          {(['month', 'week'] as ViewMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setView(m)}
              className={`px-3 py-1 ${view === m ? 'bg-stone-900 text-white' : 'hover:bg-stone-50'}`}
            >
              {m === 'month' ? 'Month' : 'Week'}
            </button>
          ))}
        </div>
        <select
          value={assigneeFilter}
          onChange={(e) => setAssigneeFilter(e.target.value)}
          className="rounded border border-stone-300 bg-white px-2 py-1.5 text-sm"
        >
          <option value="all">Everyone</option>
          {profiles?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name ?? 'Unnamed'}
            </option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-2">
          {APPT_KINDS.map((k) => (
            <span key={k} className={`rounded border px-1.5 py-0.5 text-xs ${APPT_KIND_STYLES[k]}`}>
              {APPT_KIND_LABELS[k]}
            </span>
          ))}
          <button
            onClick={() => setCreateOn(dayKey(new Date()))}
            className="rounded bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800"
          >
            New appointment
          </button>
        </div>
      </div>

      {reschedule.isError && (
        <p className="mb-2 text-sm text-red-600">
          Reschedule failed. {reschedule.error.message}
        </p>
      )}
      {isPending && <p className="py-12 text-center text-stone-500">Loading calendar…</p>}
      {isError && (
        <div className="py-12 text-center">
          <p className="mb-2 text-red-600">Could not load appointments. {error.message}</p>
          <button onClick={() => void refetch()} className="rounded border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-50">Retry</button>
        </div>
      )}

      {appointments && (
        <div className={`grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-stone-200 bg-stone-200`}>
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d} className="bg-stone-50 px-2 py-1 text-center text-xs font-semibold uppercase text-stone-500">
              {d}
            </div>
          ))}
          {days.map((day) => {
            const key = dayKey(day)
            const dayAppts = byDay.get(key) ?? []
            const inMonth = view === 'week' || day.getMonth() === cursor.getMonth()
            const isToday = key === dayKey(new Date())
            return (
              <div
                key={key}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => dropOn(day)}
                onDoubleClick={() => setCreateOn(key)}
                className={`min-h-24 bg-white p-1 ${view === 'week' ? 'min-h-96' : ''} ${
                  inMonth ? '' : 'bg-stone-50 text-stone-400'
                }`}
              >
                <div className="mb-1 flex items-center justify-between">
                  <span
                    className={`px-1 text-xs ${
                      isToday
                        ? 'rounded-full bg-amber-600 px-1.5 font-semibold text-white'
                        : 'text-stone-500'
                    }`}
                  >
                    {day.getDate()}
                  </span>
                  <button
                    onClick={() => setCreateOn(key)}
                    className="px-1 text-xs text-stone-300 hover:text-stone-600"
                    aria-label={`Add appointment on ${key}`}
                  >
                    +
                  </button>
                </div>
                <div className="space-y-1">
                  {dayAppts.map((a) => (
                    <div
                      key={a.id}
                      draggable
                      onDragStart={() => setDragged(a)}
                      onDragEnd={() => setDragged(null)}
                      className={`cursor-grab rounded border px-1.5 py-1 text-xs ${APPT_KIND_STYLES[a.kind]} ${
                        dragged?.id === a.id ? 'opacity-40' : ''
                      }`}
                    >
                      <p className="font-medium">
                        {new Date(a.starts_at).toLocaleTimeString('en-CA', {
                          hour: 'numeric',
                          minute: '2-digit',
                        })}{' '}
                        {APPT_KIND_LABELS[a.kind]}
                      </p>
                      {a.job && (
                        <Link
                          to={`/jobs/${a.job.id}`}
                          className="block truncate hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {a.job.job_number} {a.job.contact?.full_name ?? a.job.title}
                        </Link>
                      )}
                      {a.assignee?.full_name && (
                        <p className="truncate opacity-70">{a.assignee.full_name}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {createOn && <AppointmentDialog initialDate={createOn} onClose={() => setCreateOn(null)} />}
    </div>
  )
}
