import { useState, useEffect } from 'react'
import { normalizePhone } from '../../../lib/format'
import { useContact, useUpdateContact, CONTACT_TYPE_LABELS } from '../api'
import type { ContactType } from '../api'

const GRADE_COLORS: Record<number, string> = {
  1: 'bg-red-500 text-white',
  2: 'bg-orange-400 text-white',
  3: 'bg-yellow-400 text-stone-900',
  4: 'bg-lime-400 text-stone-900',
  5: 'bg-emerald-500 text-white',
}
const GRADE_LABELS: Record<number, string> = { 1: 'Cold', 2: 'Lukewarm', 3: 'Warm', 4: 'Hot', 5: 'On fire' }

interface Props {
  contactId: string
  fallbackCity?: string
  onClose: () => void
}

export function ContactQuickEditPanel({ contactId, fallbackCity, onClose }: Props) {
  const { data: contact, isPending, isError } = useContact(contactId)
  const update = useUpdateContact()
  const [form, setForm] = useState({
    full_name: '',
    phone: '',
    email: '',
    city: '',
    contact_type: '' as ContactType | '',
    lead_grade: null as number | null,
    notes: '',
  })
  const [phoneError, setPhoneError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // Populate once the contact loads
  useEffect(() => {
    if (!contact) return
    setForm({
      full_name: contact.full_name,
      phone: contact.phone ?? '',
      email: contact.email ?? '',
      city: contact.city ?? fallbackCity ?? '',
      contact_type: contact.contact_type ?? '',
      lead_grade: contact.lead_grade ?? null,
      notes: contact.notes ?? '',
    })
  }, [contact])

  const save = async () => {
    if (!form.full_name.trim()) return
    const phone = form.phone.trim() ? normalizePhone(form.phone) : null
    if (form.phone.trim() && !phone) {
      setPhoneError('Enter a valid phone number')
      return
    }
    setPhoneError(null)
    await update.mutateAsync({
      id: contactId,
      input: {
        full_name: form.full_name.trim(),
        phone,
        email: form.email.trim() || null,
        city: form.city.trim() || null,
        contact_type: (form.contact_type as ContactType) || null,
        lead_grade: form.lead_grade,
        notes: form.notes.trim() || null,
        // keep unchanged fields by omitting them (Partial<ContactInput>)
        address: contact?.address ?? null,
        extra: contact?.extra ?? {},
        lead_source: contact?.lead_source ?? null,
        company_id: contact?.company?.id ?? null,
      },
    })
    setSaved(true)
    setTimeout(() => { setSaved(false); onClose() }, 900)
  }

  const inputClass =
    'w-full rounded border border-stone-300 px-3 py-2 text-sm focus:border-amber-600 focus:outline-none'

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-20 bg-black/30"
        onClick={onClose}
      />
      {/* Panel */}
      <div className="fixed bottom-0 left-0 right-0 z-30 max-h-[80dvh] overflow-y-auto rounded-t-xl bg-white shadow-2xl sm:bottom-auto sm:left-auto sm:right-6 sm:top-16 sm:w-80 sm:rounded-xl">
        <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-stone-900">Edit contact</h3>
          <button
            onClick={onClose}
            className="rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-600"
            aria-label="Close"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {isPending && (
          <p className="px-4 py-6 text-center text-sm text-stone-500">Loading…</p>
        )}
        {isError && (
          <p className="px-4 py-6 text-center text-sm text-red-600">Could not load contact.</p>
        )}

        {contact && (
          <div className="space-y-3 p-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-600">Full name</label>
              <input
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-600">Phone</label>
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="(416) 555-1234"
                className={inputClass}
              />
              {phoneError && <p className="mt-1 text-xs text-red-600">{phoneError}</p>}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-600">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-600">City</label>
              <input
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                placeholder="Toronto"
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-stone-600">Contact type</label>
              <div className="flex gap-3 text-sm">
                {(['homeowner', 'builder', 'contractor'] as ContactType[]).map((t) => (
                  <label key={t} className="flex cursor-pointer items-center gap-1.5">
                    <input
                      type="radio"
                      name="qe_contact_type"
                      value={t}
                      checked={form.contact_type === t}
                      onChange={() => setForm({ ...form, contact_type: t })}
                      className="accent-amber-600"
                    />
                    <span>{CONTACT_TYPE_LABELS[t]}</span>
                  </label>
                ))}
              </div>
              {form.contact_type && (
                <button
                  type="button"
                  onClick={() => setForm({ ...form, contact_type: '' })}
                  className="mt-1 text-xs text-stone-400 hover:text-stone-600"
                >
                  Clear type
                </button>
              )}
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-stone-600">Lead grade</label>
              <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5].map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setForm({ ...form, lead_grade: form.lead_grade === g ? null : g })}
                    title={GRADE_LABELS[g]}
                    className={`h-8 w-8 rounded text-sm font-bold transition-transform hover:scale-110 ${
                      form.lead_grade === g
                        ? GRADE_COLORS[g] + ' ring-2 ring-stone-900/20'
                        : 'bg-stone-100 text-stone-400 hover:bg-stone-200'
                    }`}
                  >
                    {g}
                  </button>
                ))}
                {form.lead_grade && (
                  <span className="ml-1 self-center text-xs text-stone-500">{GRADE_LABELS[form.lead_grade]}</span>
                )}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-600">Notes</label>
              <textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className={inputClass}
              />
            </div>

            {update.isError && (
              <p className="text-xs text-red-600">Save failed. {update.error.message}</p>
            )}

            <div className="flex items-center justify-end gap-3 pt-1">
              {saved && <span className="text-xs text-emerald-700">Saved.</span>}
              <button
                onClick={onClose}
                className="rounded border border-stone-300 px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-50"
              >
                Cancel
              </button>
              <button
                onClick={() => void save()}
                disabled={update.isPending || !form.full_name.trim()}
                className="rounded bg-stone-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
              >
                {update.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
