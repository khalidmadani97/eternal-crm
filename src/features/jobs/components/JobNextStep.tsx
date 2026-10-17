import { useState } from 'react'
import { useProfiles } from '../../auth/api'
import { useJobTasks, useAddTask, useToggleTask } from '../api'
import { formatDate } from '../../../lib/format'

export function JobNextStep({ jobId }: { jobId: string }) {
  const { data: tasks } = useJobTasks(jobId)
  const addTask = useAddTask(jobId)
  const toggleTask = useToggleTask(jobId)
  const { data: profiles } = useProfiles()
  const [title, setTitle] = useState('')
  const [who, setWho] = useState('')
  const [when, setWhen] = useState('')

  const activeNextStep = tasks?.filter((t) => t.is_next_step && !t.completed_at).at(-1) ?? null

  const save = async () => {
    if (!title.trim()) return
    await addTask.mutateAsync({
      title: title.trim(),
      dueDate: when || null,
      assignedTo: who || null,
      isNextStep: true,
    })
    setTitle('')
    setWho('')
    setWhen('')
  }

  return (
    <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-3">
      <p className="mb-2 text-sm font-bold uppercase tracking-wide text-amber-800">
        Next Step
      </p>

      {activeNextStep ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-stone-900">{activeNextStep.title}</p>
          <div className="flex items-center gap-2 text-xs text-stone-500">
            {activeNextStep.assignee && (
              <span className="flex items-center gap-1">
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                  <circle cx="6" cy="4" r="2.2"/>
                  <path d="M1.5 10.5c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4"/>
                </svg>
                {activeNextStep.assignee.full_name ?? 'Unassigned'}
              </span>
            )}
            {activeNextStep.due_date && (
              <span className="flex items-center gap-1">
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="1" y="2" width="10" height="9" rx="1.5"/>
                  <path d="M1 5h10M4 1v2M8 1v2"/>
                </svg>
                {formatDate(activeNextStep.due_date)}
              </span>
            )}
          </div>
          <button
            onClick={() => toggleTask.mutate({ id: activeNextStep.id, done: true })}
            disabled={toggleTask.isPending}
            className="mt-1 flex w-full items-center justify-center gap-1.5 rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 7l3 3 6-6"/>
            </svg>
            Mark complete
          </button>
          {toggleTask.isError && (
            <p className="text-xs text-red-600">{toggleTask.error.message}</p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void save() }}
            placeholder="What needs to happen next?"
            className="w-full rounded border border-amber-300 bg-white px-3 py-2 text-sm focus:border-amber-600 focus:outline-none"
          />
          <div className="flex gap-2">
            <select
              value={who}
              onChange={(e) => setWho(e.target.value)}
              className="flex-1 rounded border border-amber-300 bg-white px-2 py-2 text-sm focus:border-amber-600 focus:outline-none"
            >
              <option value="">Who?</option>
              {profiles?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name ?? 'Unnamed'}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              className="rounded border border-amber-300 bg-white px-2 py-2 text-sm focus:border-amber-600 focus:outline-none"
            />
            <button
              onClick={() => void save()}
              disabled={addTask.isPending || !title.trim()}
              className="rounded bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {addTask.isPending ? '…' : 'Set'}
            </button>
          </div>
          {addTask.isError && (
            <p className="text-xs text-red-600">{addTask.error.message}</p>
          )}
        </div>
      )}
    </div>
  )
}
