import { useState } from 'react'
import { normalizePhone } from '../../../lib/format'
import { COMPANY_TYPE_LABELS, COMPANY_TYPES } from '../api'
import type { CompanyInput, CompanyRow, CompanyType } from '../api'

interface Props {
  initial?: Partial<CompanyRow>
  submitting: boolean
  submitLabel: string
  error: string | null
  onSubmit: (input: CompanyInput) => void
  onCancel: () => void
}

export function CompanyForm({ initial, submitting, submitLabel, error, onSubmit, onCancel }: Props) {
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    type: (initial?.type ?? 'designer') as CompanyType,
    phone: initial?.phone ?? '',
    email: initial?.email ?? '',
    address: initial?.address ?? '',
    notes: initial?.notes ?? '',
  })
  const [validationError, setValidationError] = useState<string | null>(null)

  const submit = () => {
    if (!form.name.trim()) {
      setValidationError('Name is required')
      return
    }
    const phone = form.phone.trim() ? normalizePhone(form.phone) : null
    if (form.phone.trim() && !phone) {
      setValidationError('Enter a valid phone number')
      return
    }
    setValidationError(null)
    onSubmit({
      name: form.name.trim(),
      type: form.type,
      phone,
      email: form.email.trim() || null,
      address: form.address.trim() || null,
      notes: form.notes.trim() || null,
    })
  }

  const inputClass =
    'w-full rounded border border-stone-300 px-3 py-2 text-sm focus:border-amber-600 focus:outline-none'

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-stone-700">Name</span>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-stone-700">Type</span>
          <select
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value as CompanyType })}
            className={inputClass}
          >
            {COMPANY_TYPES.map((t) => (
              <option key={t} value={t}>
                {COMPANY_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-stone-700">Phone</span>
          <input
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-stone-700">Email</span>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className={inputClass}
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block font-medium text-stone-700">Address</span>
          <input
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            className={inputClass}
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block font-medium text-stone-700">Notes</span>
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={2}
            className={inputClass}
          />
        </label>
      </div>
      {(validationError || error) && <p className="text-sm text-red-600">{validationError ?? error}</p>}
      <div className="flex justify-end gap-3">
        <button
          onClick={onCancel}
          className="rounded border border-stone-300 px-4 py-2 text-sm text-stone-700 hover:bg-stone-50"
        >
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={submitting}
          className="rounded bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
        >
          {submitting ? 'Saving…' : submitLabel}
        </button>
      </div>
    </div>
  )
}
