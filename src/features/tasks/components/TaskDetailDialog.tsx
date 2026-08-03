import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useProfiles } from '../../auth/api'
import { useJobs } from '../../jobs/api'
import { useDeleteTask, useUpdateTask } from '../api'
import type { TaskRow } from '../api'

/** Full task editor (Slice 38): instructions, due date, assignee, time
 *  budget, linked job — everything editable in one place. */
export function TaskDetailDialog({ task, onClose }: { task: TaskRow; onClose: () => void }) {
  const updateTask = useUpdateTask()
  const deleteTask = useDeleteTask()
  const { data: profiles } = useProfiles()
  const { data: jobs } = useJobs()
  const [form, setForm] = useState({
    title: task.title,
    description: task.description ?? '',
    due_date: task.due_date ?? '',
    assigned_to: task.assignee?.id ?? '',
    estimated_minutes: task.estimated_minutes?.toString() ?? '',
    job_id: task.job?.id ?? '',
  })
  const [validationError, setValidationError] = useState<string | null>(null)
  const done = task.completed_at !== null

  const save = () => {
    if (!form.title.trim()) {
      setValidationError('Title is required')
      return
    }
    const minutes = form.estimated_minutes ? Number(form.estimated_minutes) : null
    if (minutes !== null && (Number.isNaN(minutes) || minutes < 5 || minutes > 480)) {
      setValidationError('Time budget must be 5–480 minutes (or blank)')
      return
    }
    setValidationError(null)
    updateTask.mutate(
      {
        id: task.id,
        patch: {
          title: form.title.trim(),
          description: form.description.trim() || null,
          due_date: form.due_date || null,
          assigned_to: form.assigned_to || null,
          estimated_minutes: minutes,
          job_id: form.job_id || null,
        },
      },
      { onSuccess: onClose },
    )
  }

  const inputClass =
    'w-full rounded border border-stone-300 px-3 py-2 text-sm focus:border-amber-600 focus:outline-none'

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-4 shadow-xl sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-stone-900">Task</h2>
          <label className="flex items-center gap-2 text-sm text-stone-600">
            <input
              type="checkbox"
              checked={done}
              onChange={(e) =>
                updateTask.mutate({
                  id: task.id,
                  patch: { completed_at: e.target.checked ? new Date().toISOString() : null },
                })
              }
              className="h-4 w-4 accent-amber-600"
            />
            {done ? 'Completed' : 'Mark complete'}
          </label>
        </div>

        <div className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-stone-700">Title</span>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className={inputClass}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-stone-700">Notes / instructions</span>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={4}
              placeholder="Context, steps, key numbers — anything the person doing this needs."
              className={inputClass}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-stone-700">Due date</span>
              <input
                type="date"
                value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                className={inputClass}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-stone-700">Time budget (min)</span>
              <input
                inputMode="numeric"
                value={form.estimated_minutes}
                onChange={(e) => setForm({ ...form, estimated_minutes: e.target.value })}
                placeholder="15"
                className={inputClass}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-stone-700">Assigned to</span>
              <select
                value={form.assigned_to}
                onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}
                className={inputClass}
              >
                <option value="">Unassigned</option>
                {profiles?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name ?? 'Unnamed'}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-stone-700">Job</span>
              <select
                value={form.job_id}
                onChange={(e) => setForm({ ...form, job_id: e.target.value })}
                className={inputClass}
              >
                <option value="">No job</option>
                {jobs?.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.job_number} — {j.title}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {task.job && (
            <Link
              to={`/jobs/${task.job.id}`}
              onClick={onClose}
              className="inline-block text-sm text-amber-700 hover:underline"
            >
              Open {task.job.job_number} →
            </Link>
          )}
        </div>

        {(validationError || updateTask.isError || deleteTask.isError) && (
          <p className="mt-2 text-sm text-red-600">
            {validationError ?? updateTask.error?.message ?? deleteTask.error?.message}
          </p>
        )}
        <div className="mt-4 flex items-center justify-between">
          <button
            onClick={() => {
              if (window.confirm('Delete this task?'))
                deleteTask.mutate(task.id, { onSuccess: onClose })
            }}
            className="text-sm text-stone-400 hover:text-red-600"
          >
            Delete
          </button>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="rounded border border-stone-300 px-4 py-2 text-sm text-stone-700 hover:bg-stone-50"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={updateTask.isPending}
              className="rounded bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
            >
              {updateTask.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
