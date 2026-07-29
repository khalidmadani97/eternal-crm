import { useState } from 'react'
import { formatDate } from '../../../lib/format'
import { useAddTask, useJobTasks, useToggleTask } from '../api'

export function JobTasks({ jobId }: { jobId: string }) {
  const { data: tasks, isPending, isError, error } = useJobTasks(jobId)
  const addTask = useAddTask(jobId)
  const toggleTask = useToggleTask(jobId)
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState('')

  const submit = async () => {
    if (!title.trim()) return
    await addTask.mutateAsync({ title: title.trim(), dueDate: dueDate || null })
    setTitle('')
    setDueDate('')
  }

  return (
    <section className="rounded-lg border border-stone-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">Tasks</h2>
      <div className="mb-3 flex gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit()
          }}
          placeholder="Add a task…"
          className="flex-1 rounded border border-stone-300 px-3 py-2 text-sm focus:border-amber-600 focus:outline-none"
        />
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="rounded border border-stone-300 px-2 py-2 text-sm"
        />
        <button
          onClick={() => void submit()}
          disabled={addTask.isPending || !title.trim()}
          className="rounded bg-stone-900 px-3 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
        >
          Add
        </button>
      </div>
      {addTask.isError && (
        <p className="mb-2 text-sm text-red-600">Could not add the task. {addTask.error.message}</p>
      )}
      {isPending && <p className="py-2 text-sm text-stone-500">Loading tasks…</p>}
      {isError && <p className="py-2 text-sm text-red-600">Could not load tasks. {error.message}</p>}
      {tasks && tasks.length === 0 && <p className="py-2 text-sm text-stone-500">No tasks.</p>}
      <ul className="space-y-2">
        {tasks?.map((t) => (
          <li key={t.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={t.completed_at !== null}
              onChange={(e) => toggleTask.mutate({ id: t.id, done: e.target.checked })}
              className="h-4 w-4 accent-amber-600"
            />
            <span className={t.completed_at ? 'text-stone-400 line-through' : 'text-stone-800'}>
              {t.title}
            </span>
            {t.due_date && (
              <span className="ml-auto text-xs text-stone-400">{formatDate(t.due_date)}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
