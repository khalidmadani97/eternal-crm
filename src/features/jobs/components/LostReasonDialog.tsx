import { useState } from 'react'

interface Props {
  onConfirm: (reason: string) => void
  onCancel: () => void
}

/** Moving a job to `lost` requires a reason — the dialog blocks until one is
 *  given or the change is cancelled. Used by the detail page and the board. */
export function LostReasonDialog({ onConfirm, onCancel }: Props) {
  const [reason, setReason] = useState('')
  const [touched, setTouched] = useState(false)

  const submit = () => {
    setTouched(true)
    if (reason.trim()) onConfirm(reason.trim())
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 className="mb-2 text-lg font-semibold text-stone-900">Mark job as lost</h2>
        <p className="mb-3 text-sm text-stone-600">
          Why was this job lost? This feeds win-rate reporting.
        </p>
        <textarea
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          className="w-full rounded border border-stone-300 px-3 py-2 text-sm focus:border-amber-600 focus:outline-none"
          placeholder="Went with another fabricator on price…"
        />
        {touched && !reason.trim() && (
          <p className="mt-1 text-sm text-red-600">A reason is required.</p>
        )}
        <div className="mt-4 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded border border-stone-300 px-4 py-2 text-sm text-stone-700 hover:bg-stone-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            className="rounded bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800"
          >
            Mark lost
          </button>
        </div>
      </div>
    </div>
  )
}
