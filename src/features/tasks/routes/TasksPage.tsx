import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'
import { useProfiles } from '../../auth/api'
import { useJobs } from '../../jobs/api'
import { formatDate } from '../../../lib/format'
import { useAllTasks, useCreateTask, useDeleteTask, useUpdateTask } from '../api'
import type { TaskRow } from '../api'

type StatusFilter = 'open' | 'done' | 'all'

export function TasksPage() {
  const { session } = useAuth()
  const { data: tasks, isPending, isError, error, refetch } = useAllTasks()
  const { data: profiles } = useProfiles()
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open')
  const [assigneeFilter, setAssigneeFilter] = useState('all')

  const today = new Date().toISOString().slice(0, 10)
  const visible = useMemo(() => {
    return (tasks ?? []).filter((t) => {
      if (statusFilter === 'open' && t.completed_at) return false
      if (statusFilter === 'done' && !t.completed_at) return false
      if (assigneeFilter === 'me' && t.assignee?.id !== session?.user.id) return false
      if (assigneeFilter === 'none' && t.assignee) return false
      if (
        assigneeFilter !== 'all' &&
        assigneeFilter !== 'me' &&
        assigneeFilter !== 'none' &&
        t.assignee?.id !== assigneeFilter
      )
        return false
      return true
    })
  }, [tasks, statusFilter, assigneeFilter, session?.user.id])

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold text-stone-900">Tasks</h1>
        <div className="flex rounded border border-stone-300 text-sm">
          {(['open', 'done', 'all'] as StatusFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 capitalize ${statusFilter === s ? 'bg-stone-900 text-white' : 'hover:bg-stone-50'}`}
            >
              {s}
            </button>
          ))}
        </div>
        <select
          value={assigneeFilter}
          onChange={(e) => setAssigneeFilter(e.target.value)}
          className="rounded border border-stone-300 bg-white px-2 py-1.5 text-sm"
        >
          <option value="all">Everyone</option>
          <option value="me">Mine</option>
          <option value="none">Unassigned</option>
          {profiles?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name ?? 'Unnamed'}
            </option>
          ))}
        </select>
      </div>

      <NewTaskRow />

      {isPending && <p className="py-12 text-center text-stone-500">Loading tasks…</p>}
      {isError && (
        <div className="py-12 text-center">
          <p className="mb-2 text-red-600">Could not load tasks. {error.message}</p>
          <button
            onClick={() => void refetch()}
            className="rounded border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-50"
          >
            Retry
          </button>
        </div>
      )}
      {tasks && visible.length === 0 && (
        <p className="py-12 text-center text-stone-500">
          {tasks.length === 0 ? 'No tasks yet.' : 'Nothing matches the filters.'}
        </p>
      )}

      {visible.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
          <table className="w-full text-sm">
            <tbody>
              {visible.map((t) => (
                <TaskLine key={t.id} task={t} today={today} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function TaskLine({ task, today }: { task: TaskRow; today: string }) {
  const updateTask = useUpdateTask()
  const deleteTask = useDeleteTask()
  const { data: profiles } = useProfiles()
  const overdue = !task.completed_at && !!task.due_date && task.due_date < today

  return (
    <tr className="border-b border-stone-100 last:border-0 hover:bg-stone-50">
      <td className="w-10 px-4 py-2.5">
        <input
          type="checkbox"
          checked={task.completed_at !== null}
          onChange={(e) =>
            updateTask.mutate({
              id: task.id,
              patch: { completed_at: e.target.checked ? new Date().toISOString() : null },
            })
          }
          className="h-4 w-4 accent-amber-600"
        />
      </td>
      <td className="px-2 py-2.5">
        <span className={task.completed_at ? 'text-stone-400 line-through' : 'text-stone-900'}>
          {task.title}
        </span>
        {task.estimated_minutes && (
          <span className="ml-2 rounded bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-500">
            {task.estimated_minutes}m
          </span>
        )}
        {task.job && (
          <Link to={`/jobs/${task.job.id}`} className="ml-2 text-xs text-amber-700 hover:underline">
            {task.job.job_number}
          </Link>
        )}
      </td>
      <td className="w-40 px-2 py-2.5">
        <select
          value={task.assignee?.id ?? ''}
          onChange={(e) =>
            updateTask.mutate({ id: task.id, patch: { assigned_to: e.target.value || null } })
          }
          className="w-full rounded border border-transparent bg-transparent px-1 py-1 text-xs text-stone-600 hover:border-stone-300"
        >
          <option value="">Unassigned</option>
          {profiles?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name ?? 'Unnamed'}
            </option>
          ))}
        </select>
      </td>
      <td className={`w-28 px-2 py-2.5 text-right text-xs ${overdue ? 'font-semibold text-red-600' : 'text-stone-400'}`}>
        {task.due_date ? formatDate(task.due_date) : '—'}
      </td>
      <td className="w-10 px-2 py-2.5 text-right">
        <button
          onClick={() => {
            if (window.confirm('Delete this task?')) deleteTask.mutate(task.id)
          }}
          className="text-stone-300 hover:text-red-600"
          aria-label="Delete task"
        >
          ×
        </button>
      </td>
    </tr>
  )
}

function NewTaskRow() {
  const createTask = useCreateTask()
  const { data: jobs } = useJobs()
  const { data: profiles } = useProfiles()
  const [title, setTitle] = useState('')
  const [jobId, setJobId] = useState('')
  const [assignee, setAssignee] = useState('')
  const [dueDate, setDueDate] = useState('')

  const submit = () => {
    if (!title.trim()) return
    createTask.mutate(
      {
        title: title.trim(),
        job_id: jobId || null,
        assigned_to: assignee || null,
        due_date: dueDate || null,
      },
      {
        onSuccess: () => {
          setTitle('')
          setDueDate('')
        },
      },
    )
  }

  const inputClass =
    'rounded border border-stone-300 px-2 py-1.5 text-sm focus:border-amber-600 focus:outline-none'

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-stone-200 bg-white p-3">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit()
        }}
        placeholder="New task…"
        className={`${inputClass} min-w-56 flex-1`}
      />
      <select value={jobId} onChange={(e) => setJobId(e.target.value)} className={inputClass}>
        <option value="">No job</option>
        {jobs?.map((j) => (
          <option key={j.id} value={j.id}>
            {j.job_number} — {j.title}
          </option>
        ))}
      </select>
      <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className={inputClass}>
        <option value="">Unassigned</option>
        {profiles?.map((p) => (
          <option key={p.id} value={p.id}>
            {p.full_name ?? 'Unnamed'}
          </option>
        ))}
      </select>
      <input
        type="date"
        value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
        className={inputClass}
      />
      <button
        onClick={submit}
        disabled={createTask.isPending || !title.trim()}
        className="rounded bg-stone-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
      >
        {createTask.isPending ? 'Adding…' : 'Add'}
      </button>
      {createTask.isError && <span className="text-sm text-red-600">{createTask.error.message}</span>}
    </div>
  )
}
