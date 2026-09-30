import { useState } from 'react'
import { ExtraFieldsEditor } from '../../../components/ExtraFieldsEditor'
import { OptionSelect } from '../../../components/OptionSelect'
import { useCompanies } from '../../companies/api'
import { normalizePhone } from '../../../lib/format'
import type { ContactInput, ContactRow, ContactType } from '../api'
import { CONTACT_TYPE_LABELS } from '../api'

interface Props {
  initial?: Partial<ContactRow>
  submitting: boolean
  submitLabel: string
  error: string | null
  onSubmit: (input: ContactInput) => void
  onCancel: () => void
}

export function ContactForm({ initial, submitting, submitLabel, error, onSubmit, onCancel }: Props) {
  const { data: companies } = useCompanies()
  const [form, setForm] = useState({
    full_name: initial?.full_name ?? '',
    phone: initial?.phone ?? '',
    email: initial?.email ?? '',
    address: initial?.address ?? '',
    city: initial?.city ?? '',
    contact_type: (initial?.contact_type ?? '') as ContactType | '',
    lead_source: initial?.lead_source ?? '',
    company_id: initial?.company?.id ?? '',
    notes: initial?.notes ?? '',
  })
  const [extra, setExtra] = useState<Record<string, string>>(initial?.extra ?? {})
  const [validationError, setValidationError] = useState<string | null>(null)

  const submit = () => {
    if (!form.full_name.trim()) {
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
      full_name: form.full_name.trim(),
      phone,
      email: form.email.trim() || null,
      address: form.address.trim() || null,
      city: form.city.trim() || null,
      contact_type: (form.contact_type as ContactType) || null,
      extra: Object.fromEntries(Object.entries(extra).filter(([, v]) => v.trim() !== '')),
      lead_source: form.lead_source.trim() || null,
      company_id: form.company_id || null,
      notes: form.notes.trim() || null,
    })
  }

  const inputClass =
    'w-full rounded border border-stone-300 px-3 py-2 text-sm focus:border-amber-600 focus:outline-none'
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [key]: e.target.value })

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block font-medium text-stone-700">Full name</span>
          <input value={form.full_name} onChange={set('full_name')} className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-stone-700">Phone</span>
          <input value={form.phone} onChange={set('phone')} className={inputClass} placeholder="(416) 555-1234" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-stone-700">Email</span>
          <input type="email" value={form.email} onChange={set('email')} className={inputClass} />
        </label>
        <div className="text-sm sm:col-span-2">
          <span className="mb-1.5 block font-medium text-stone-700">Contact type</span>
          <div className="flex gap-3">
            {(['homeowner', 'builder', 'contractor'] as ContactType[]).map((t) => (
              <label key={t} className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="radio"
                  name="contact_type"
                  value={t}
                  checked={form.contact_type === t}
                  onChange={() => setForm({ ...form, contact_type: t })}
                  className="accent-amber-600"
                />
                <span>{CONTACT_TYPE_LABELS[t]}</span>
              </label>
            ))}
            {form.contact_type && (
              <button
                type="button"
                onClick={() => setForm({ ...form, contact_type: '' })}
                className="ml-auto text-xs text-stone-400 hover:text-stone-600"
              >
                Clear
              </button>
            )}
          </div>
        </div>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-stone-700">Address</span>
          <input value={form.address} onChange={set('address')} className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-stone-700">City</span>
          <input value={form.city} onChange={set('city')} placeholder="Toronto" className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-stone-700">Company</span>
          <select value={form.company_id} onChange={set('company_id')} className={inputClass}>
            <option value="">None</option>
            {companies?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-stone-700">Lead source</span>
          <OptionSelect
            listKey="lead_sources"
            value={form.lead_source}
            onChange={(v) => setForm({ ...form, lead_source: v })}
          />
        </label>
        <div className="text-sm sm:col-span-2">
          <span className="mb-1 block font-medium text-stone-700">Extra info</span>
          <ExtraFieldsEditor value={extra} onChange={setExtra} />
        </div>
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block font-medium text-stone-700">Notes</span>
          <textarea value={form.notes} onChange={set('notes')} rows={2} className={inputClass} />
        </label>
      </div>
      {(validationError || error) && (
        <p className="text-sm text-red-600">{validationError ?? error}</p>
      )}
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
