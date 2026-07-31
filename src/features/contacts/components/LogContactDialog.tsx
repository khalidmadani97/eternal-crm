import { useState } from 'react'
import { useAuth } from '../../auth/AuthProvider'
import { useProfiles } from '../../auth/api'
import { BUSINESS } from '../../../lib/business'
import { CONTACT_METHOD_LABELS, useLogContact } from '../api'
import type { ContactMethod } from '../api'

/** Log a touch made outside the CRM (Slice 24). Who + method + detail; the
 *  detail pre-fills sensibly per method (your number, the business email…)
 *  and stays editable. In-CRM texts/calls/DMs log themselves automatically. */
export function LogContactDialog({
  contactId,
  contactPhone,
  onClose,
}: {
  contactId: string
  contactPhone?: string | null
  onClose: () => void
}) {
  const { session } = useAuth()
  const { data: profiles } = useProfiles()
  const logContact = useLogContact()

  const defaultDetail = (method: ContactMethod): string => {
    switch (method) {
      case 'call':
      case 'sms':
        return BUSINESS.phone
      case 'email':
        return BUSINESS.email
      case 'messenger':
        return 'Meta Business Suite'
      case 'instagram':
        return 'Instagram'
      default:
        return ''
    }
  }

  const [form, setForm] = useState({
    method: 'call' as ContactMethod,
    detail: defaultDetail('call'),
    by: session?.user.id ?? '',
    at: new Date().toISOString().slice(0, 16),
    note: '',
  })

  const setMethod = (method: ContactMethod) =>
    setForm({ ...form, method, detail: defaultDetail(method) })

  const submit = () => {
    logContact.mutate(
      {
        contactId,
        method: form.method,
        detail: form.detail.trim() || null,
        at: new Date(form.at).toISOString(),
        by: form.by || null,
        note: form.note.trim() || null,
      },
      { onSuccess: onClose },
    )
  }

  const inputClass =
    'w-full rounded border border-stone-300 px-3 py-2 text-sm focus:border-amber-600 focus:outline-none'

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 className="mb-1 text-lg font-semibold text-stone-900">Log a contact</h2>
        <p className="mb-4 text-xs text-stone-500">
          For touches made outside the CRM — in-app texts, calls, and DMs are logged automatically.
          {contactPhone ? '' : ' '}
        </p>
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-stone-700">Who contacted</span>
            <select
              value={form.by}
              onChange={(e) => setForm({ ...form, by: e.target.value })}
              className={inputClass}
            >
              {profiles?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name ?? 'Unnamed'}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-stone-700">Method</span>
              <select
                value={form.method}
                onChange={(e) => setMethod(e.target.value as ContactMethod)}
                className={inputClass}
              >
                {(Object.keys(CONTACT_METHOD_LABELS) as ContactMethod[]).map((m) => (
                  <option key={m} value={m}>
                    {CONTACT_METHOD_LABELS[m]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-stone-700">When</span>
              <input
                type="datetime-local"
                value={form.at}
                onChange={(e) => setForm({ ...form, at: e.target.value })}
                className={inputClass}
              />
            </label>
          </div>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-stone-700">
              From (number / email / channel)
            </span>
            <input
              value={form.detail}
              onChange={(e) => setForm({ ...form, detail: e.target.value })}
              className={inputClass}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-stone-700">Note (optional)</span>
            <input
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="Left voicemail about template date"
              className={inputClass}
            />
          </label>
        </div>
        {logContact.isError && (
          <p className="mt-2 text-sm text-red-600">{logContact.error.message}</p>
        )}
        <div className="mt-4 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded border border-stone-300 px-4 py-2 text-sm text-stone-700 hover:bg-stone-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={logContact.isPending}
            className="rounded bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
          >
            {logContact.isPending ? 'Logging…' : 'Log contact'}
          </button>
        </div>
      </div>
    </div>
  )
}
