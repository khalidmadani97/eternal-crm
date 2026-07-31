import { useState } from 'react'
import { useAddOption, useOptionList } from '../features/settings/api'

interface Props {
  listKey: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

/** Dropdown backed by a user-editable list (Slice 25). "+ Add new…" saves a
 *  new option in place and selects it — the full list is managed in
 *  Settings. A stored value missing from the list still displays. */
export function OptionSelect({ listKey, value, onChange, placeholder = '—', className }: Props) {
  const { data: options } = useOptionList(listKey)
  const addOption = useAddOption()
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')

  const baseClass =
    className ??
    'w-full rounded border border-stone-300 px-3 py-2 text-sm focus:border-amber-600 focus:outline-none'

  if (adding) {
    const save = () => {
      const trimmed = draft.trim()
      if (!trimmed) {
        setAdding(false)
        return
      }
      addOption.mutate(
        { listKey, value: trimmed },
        {
          onSuccess: () => {
            onChange(trimmed)
            setAdding(false)
            setDraft('')
          },
          onError: () => {
            // Likely a duplicate — just select it.
            onChange(trimmed)
            setAdding(false)
            setDraft('')
          },
        },
      )
    }
    return (
      <span className="flex gap-1">
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              save()
            }
            if (e.key === 'Escape') setAdding(false)
          }}
          placeholder="New option…"
          className={baseClass}
        />
        <button
          type="button"
          onClick={save}
          disabled={addOption.isPending}
          className="rounded bg-stone-900 px-2 text-sm text-white disabled:opacity-50"
        >
          ✓
        </button>
      </span>
    )
  }

  const known = options?.some((o) => o.value === value)

  return (
    <select
      value={value}
      onChange={(e) => {
        if (e.target.value === '__add__') setAdding(true)
        else onChange(e.target.value)
      }}
      className={baseClass}
    >
      <option value="">{placeholder}</option>
      {value && !known && <option value={value}>{value}</option>}
      {options?.map((o) => (
        <option key={o.id} value={o.value}>
          {o.value}
        </option>
      ))}
      <option value="__add__">＋ Add new…</option>
    </select>
  )
}
