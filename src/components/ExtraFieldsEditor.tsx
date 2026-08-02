import { useState } from 'react'

/** Free-form label→value fields (Slice 47): "+ Add field" gives any record
 *  an extra spot for info without a schema change. */
export function ExtraFieldsEditor({
  value,
  onChange,
}: {
  value: Record<string, string>
  onChange: (next: Record<string, string>) => void
}) {
  const [newLabel, setNewLabel] = useState('')
  const entries = Object.entries(value)

  const setField = (key: string, v: string) => onChange({ ...value, [key]: v })
  const removeField = (key: string) => {
    const next = { ...value }
    delete next[key]
    onChange(next)
  }
  const addField = () => {
    const label = newLabel.trim()
    if (!label || value[label] !== undefined) return
    onChange({ ...value, [label]: '' })
    setNewLabel('')
  }

  return (
    <div className="space-y-2">
      {entries.map(([key, v]) => (
        <div key={key} className="flex items-center gap-2">
          <span className="w-32 shrink-0 truncate text-sm font-medium text-stone-700" title={key}>
            {key}
          </span>
          <input
            value={v}
            onChange={(e) => setField(key, e.target.value)}
            className="flex-1 rounded border border-stone-300 px-3 py-2 text-sm focus:border-amber-600 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => removeField(key)}
            className="text-stone-300 hover:text-red-600"
            aria-label={`Remove ${key}`}
          >
            ×
          </button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addField()
            }
          }}
          placeholder="New field name (e.g. Gate code, Parking)…"
          className="flex-1 rounded border border-dashed border-stone-300 px-3 py-1.5 text-sm focus:border-amber-600 focus:outline-none"
        />
        <button
          type="button"
          onClick={addField}
          disabled={!newLabel.trim()}
          className="rounded border border-stone-300 px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-50 disabled:opacity-40"
        >
          + Add field
        </button>
      </div>
    </div>
  )
}
