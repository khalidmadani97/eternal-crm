import { useState } from 'react'
import { TeamEditor } from '../components/TeamEditor'
import {
  OPTION_LISTS,
  useAddOption,
  useDeleteOption,
  useOptionList,
  useUpdateOption,
} from '../api'

export function SettingsPage() {
  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-stone-900">Settings</h1>
      <p className="mb-4 text-sm text-stone-500">
        Dropdown lists used across the CRM. Deactivating an option hides it from new entries;
        anything already saved keeps its value.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        <TeamEditor />
        {OPTION_LISTS.map((list) => (
          <ListEditor key={list.key} listKey={list.key} label={list.label} description={list.description} />
        ))}
      </div>
    </div>
  )
}

function ListEditor({
  listKey,
  label,
  description,
}: {
  listKey: string
  label: string
  description: string
}) {
  const { data: options, isPending, isError, error } = useOptionList(listKey, true)
  const addOption = useAddOption()
  const updateOption = useUpdateOption()
  const deleteOption = useDeleteOption()
  const [draft, setDraft] = useState('')

  const add = () => {
    if (!draft.trim()) return
    addOption.mutate({ listKey, value: draft.trim() }, { onSuccess: () => setDraft('') })
  }

  const move = (index: number, dir: -1 | 1) => {
    if (!options) return
    const target = index + dir
    if (target < 0 || target >= options.length) return
    updateOption.mutate({ id: options[index].id, patch: { position: options[target].position } })
    updateOption.mutate({ id: options[target].id, patch: { position: options[index].position } })
  }

  return (
    <section className="rounded-lg border border-stone-200 bg-white p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">{label}</h2>
      <p className="mb-3 text-xs text-stone-400">{description}</p>
      {isPending && <p className="py-2 text-sm text-stone-500">Loading…</p>}
      {isError && <p className="py-2 text-sm text-red-600">Could not load. {error.message}</p>}
      {options && options.length === 0 && (
        <p className="py-2 text-sm text-stone-500">No options yet — add the first below.</p>
      )}
      <ul className="space-y-1.5">
        {options?.map((o, i) => (
          <li key={o.id} className="flex items-center gap-2">
            <div className="flex flex-col">
              <button
                onClick={() => move(i, -1)}
                disabled={i === 0}
                className="px-1 text-[10px] text-stone-400 hover:text-stone-700 disabled:opacity-30"
                aria-label={`Move ${o.value} up`}
              >
                ▲
              </button>
              <button
                onClick={() => move(i, 1)}
                disabled={i === (options?.length ?? 0) - 1}
                className="px-1 text-[10px] text-stone-400 hover:text-stone-700 disabled:opacity-30"
                aria-label={`Move ${o.value} down`}
              >
                ▼
              </button>
            </div>
            <input
              defaultValue={o.value}
              onBlur={(e) => {
                const v = e.target.value.trim()
                if (v && v !== o.value) updateOption.mutate({ id: o.id, patch: { value: v } })
              }}
              className={`flex-1 rounded border border-stone-200 px-2 py-1.5 text-sm focus:border-amber-600 focus:outline-none ${
                o.active ? '' : 'text-stone-400 line-through'
              }`}
            />
            <label className="flex items-center gap-1 text-xs text-stone-500">
              <input
                type="checkbox"
                checked={o.active}
                onChange={(e) => updateOption.mutate({ id: o.id, patch: { active: e.target.checked } })}
                className="h-3.5 w-3.5 accent-amber-600"
              />
              active
            </label>
            <button
              onClick={() => {
                if (window.confirm(`Delete "${o.value}"? Existing records keep the value.`))
                  deleteOption.mutate(o.id)
              }}
              className="text-stone-300 hover:text-red-600"
              aria-label={`Delete ${o.value}`}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add()
          }}
          placeholder="Add option…"
          className="flex-1 rounded border border-stone-300 px-2 py-1.5 text-sm focus:border-amber-600 focus:outline-none"
        />
        <button
          onClick={add}
          disabled={addOption.isPending || !draft.trim()}
          className="rounded bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
        >
          Add
        </button>
      </div>
      {(addOption.isError || updateOption.isError) && (
        <p className="mt-2 text-sm text-red-600">
          {addOption.error?.message ?? updateOption.error?.message}
        </p>
      )}
    </section>
  )
}
