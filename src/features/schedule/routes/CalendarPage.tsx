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
import { CalendarSyncDialog } from '../components/CalendarSyncDialog'

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
  const [showSync, setShowSync] = useState(false)
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

  const moveDragged = (newStart: Date) => {
    if (!dragged) return
    const oldStart = new Date(dragged.starts_at)
    const delta = newStart.getTime() - oldStart.getTime()
    setDragged(null)
    if (delta === 0) return
    const newEnd = dragged.ends_at
      ? new Date(new Date(dragged.ends_at).getTime() + delta).toISOString()
      : null
    reschedule.mutate({ id: dragged.id, startsAt: newStart.toISOString(), endsAt: newEnd })
  }

  // Month view: drop on a day keeps the time of day.
  const dropOn = (day: Date) => {
    if (!dragged) return
    const oldStart = new Date(dragged.starts_at)
    moveDragged(
      new Date(day.getFullYear(), day.getMonth(), day.getDate(), oldStart.getHours(), oldStart.getMinutes()),
    )
  }

  // Week view: drop on a half-hour slot moves the event to that exact slot.
  const dropOnSlot = (day: Date, minutesFromMidnight: number) => {
    if (!dragged) return
    moveDragged(
      new Date(
        day.getFullYear(),
        day.getMonth(),
        day.getDate(),
        Math.floor(minutesFromMidnight / 60),
        minutesFromMidnight % 60,
      ),
    )
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
            onClick={() => setShowSync(true)}
            className="rounded border border-stone-300 px-3 py-2 text-sm text-stone-700 hover:bg-stone-50"
          >
            Link Google Calendar
          </button>
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

      {appointments && view === 'week' && (
        <WeekGrid
          days={days}
          byDay={byDay}
          dragged={dragged}
          setDragged={setDragged}
          onDropSlot={dropOnSlot}
          onCreate={(key) => setCreateOn(key)}
        />
      )}

      {appointments && view === 'month' && (
        <div className={`grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-stone-200 bg-stone-200`}>
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d} className="bg-stone-50 px-2 py-1 text-center text-xs font-semibold uppercase text-stone-500">
              {d}
            </div>
          ))}
          {days.map((day) => {
            const key = dayKey(day)
            const dayAppts = byDay.get(key) ?? []
            const inMonth = day.getMonth() === cursor.getMonth()
            const isToday = key === dayKey(new Date())
            return (
              <div
                key={key}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); dropOn(day) }}
                onDoubleClick={() => setCreateOn(key)}
                className={`min-h-24 bg-white p-1 ${
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
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', a.id)
                        e.dataTransfer.effectAllowed = 'move'
                        setDragged(a)
                      }}
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
                          draggable={false}
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
      {showSync && <CalendarSyncDialog onClose={() => setShowSync(false)} />}
    </div>
  )
}

// ── Week time grid (Slice 18) ────────────────────────────────────────────────
// 7:00–20:00 in half-hour slots. Events are positioned by start time and
// duration; dragging a block onto any slot (same or another day) reschedules
// it to that exact time.

const DAY_START_HOUR = 7
const DAY_END_HOUR = 20
const PX_PER_HOUR = 48
const SLOT_MINUTES = 30

function WeekGrid({
  days,
  byDay,
  dragged,
  setDragged,
  onDropSlot,
  onCreate,
}: {
  days: Date[]
  byDay: Map<string, AppointmentRow[]>
  dragged: AppointmentRow | null
  setDragged: (a: AppointmentRow | null) => void
  onDropSlot: (day: Date, minutesFromMidnight: number) => void
  onCreate: (dayKey: string) => void
}) {
  const [hoverSlot, setHoverSlot] = useState<string | null>(null)
  const hours: number[] = []
  for (let h = DAY_START_HOUR; h < DAY_END_HOUR; h++) hours.push(h)
  const slotsPerDay = ((DAY_END_HOUR - DAY_START_HOUR) * 60) / SLOT_MINUTES
  const gridHeight = (DAY_END_HOUR - DAY_START_HOUR) * PX_PER_HOUR

  return (
    <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
      <div className="grid min-w-[56rem] grid-cols-[3.5rem_repeat(7,1fr)]">
        <div className="border-b border-stone-200" />
        {days.map((day) => {
          const key = dayKey(day)
          const isToday = key === dayKey(new Date())
          return (
            <div
              key={key}
              className="border-b border-l border-stone-200 px-2 py-1.5 text-center"
            >
              <span
                className={`text-xs font-semibold uppercase ${
                  isToday ? 'text-amber-700' : 'text-stone-500'
                }`}
              >
                {day.toLocaleDateString('en-CA', { weekday: 'short' })}{' '}
                <span className={isToday ? 'rounded-full bg-amber-600 px-1.5 text-white' : ''}>
                  {day.getDate()}
                </span>
              </span>
              <button
                onClick={() => onCreate(key)}
                className="ml-1 text-xs text-stone-300 hover:text-stone-600"
                aria-label={`Add appointment on ${key}`}
              >
                +
              </button>
            </div>
          )
        })}

        {/* time gutter */}
        <div className="relative" style={{ height: gridHeight }}>
          {hours.map((h) => (
            <div
              key={h}
              className="absolute right-1 -translate-y-1/2 text-[10px] tabular-nums text-stone-400"
              style={{ top: (h - DAY_START_HOUR) * PX_PER_HOUR }}
            >
              {h === 12 ? '12 pm' : h > 12 ? `${h - 12} pm` : `${h} am`}
            </div>
          ))}
        </div>

        {days.map((day) => {
          const key = dayKey(day)
          const dayAppts = byDay.get(key) ?? []
          return (
            <div
              key={key}
              className="relative border-l border-stone-200"
              style={{ height: gridHeight }}
            >
              {/* hour lines */}
              {hours.map((h) => (
                <div
                  key={h}
                  className="absolute inset-x-0 border-t border-stone-100"
                  style={{ top: (h - DAY_START_HOUR) * PX_PER_HOUR }}
                />
              ))}
              {/* half-hour drop slots */}
              {Array.from({ length: slotsPerDay }, (_, i) => {
                const minutes = DAY_START_HOUR * 60 + i * SLOT_MINUTES
                const slotId = `${key}-${minutes}`
                return (
                  <div
                    key={slotId}
                    onDragOver={(e) => {
                      e.preventDefault()
                      setHoverSlot(slotId)
                    }}
                    onDragLeave={() => setHoverSlot((s) => (s === slotId ? null : s))}
                    onDrop={(e) => {
                      e.preventDefault()
                      setHoverSlot(null)
                      onDropSlot(day, minutes)
                    }}
                    className={`absolute inset-x-0 ${
                      hoverSlot === slotId && dragged ? 'bg-amber-100/70' : ''
                    }`}
                    style={{
                      top: (i * SLOT_MINUTES * PX_PER_HOUR) / 60,
                      height: (SLOT_MINUTES * PX_PER_HOUR) / 60,
                    }}
                  />
                )
              })}
              {/* events */}
              {dayAppts.map((a) => {
                const start = new Date(a.starts_at)
                const startMin = start.getHours() * 60 + start.getMinutes()
                const endMin = a.ends_at
                  ? (() => {
                      const end = new Date(a.ends_at)
                      return dayKey(end) === key
                        ? end.getHours() * 60 + end.getMinutes()
                        : DAY_END_HOUR * 60
                    })()
                  : startMin + 60
                const top = Math.max(0, ((startMin - DAY_START_HOUR * 60) * PX_PER_HOUR) / 60)
                const height = Math.max(
                  22,
                  ((Math.min(endMin, DAY_END_HOUR * 60) - Math.max(startMin, DAY_START_HOUR * 60)) *
                    PX_PER_HOUR) /
                    60,
                )
                return (
                  <div
                    key={a.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', a.id)
                      e.dataTransfer.effectAllowed = 'move'
                      setDragged(a)
                    }}
                    onDragEnd={() => setDragged(null)}
                    className={`absolute inset-x-0.5 z-10 cursor-grab overflow-hidden rounded border px-1.5 py-0.5 text-xs ${APPT_KIND_STYLES[a.kind]} ${
                      dragged?.id === a.id ? 'opacity-40' : ''
                    }`}
                    style={{ top, height }}
                  >
                    <p className="truncate font-medium">
                      {start.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' })}{' '}
                      {APPT_KIND_LABELS[a.kind]}
                    </p>
                    {a.job && (
                      <Link
                        to={`/jobs/${a.job.id}`}
                        draggable={false}
                        className="block truncate hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {a.job.contact?.full_name ?? a.job.title}
                      </Link>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
