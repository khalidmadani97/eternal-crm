import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { OptionSelect } from '../../../components/OptionSelect'
import { useContactSearch, useCreateContact } from '../../contacts/api'
import type { ContactOption } from '../../contacts/api'
import { normalizePhone, calcMargin, marginColor } from '../../../lib/format'
import type { ContactType } from '../../contacts/api'
import { CONTACT_TYPE_LABELS } from '../../contacts/api'
import { useCreateJob } from '../api'
import { newJobSchema } from '../schema'
import type { NewJobForm } from '../schema'

import type { JobStage } from '../api'

interface Props {
  onClose: () => void
  /** Pipeline creates leads at 'new'; the Jobs workspace starts at 'won'. */
  initialStage?: JobStage
  pipelineId?: string | null
}

export function NewJobDialog({ onClose, initialStage = 'new', pipelineId = null }: Props) {
  const createJob = useCreateJob()
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<NewJobForm>({ resolver: zodResolver(newJobSchema) })
  const contactId = watch('contact_id')
  const [selectedContact, setSelectedContact] = useState<ContactOption | null>(null)

  const [direction, setDirection] = useState<'north' | 'south' | 'east' | 'west' | ''>('')

  const onSubmit = async (values: NewJobForm) => {
    await createJob.mutateAsync({
      contact_id: values.contact_id,
      stage: initialStage,
      pipeline_id: pipelineId,
      title: values.title,
      summary: values.summary?.trim() || null,
      site_address: values.site_address || null,
      value_est: values.value_est ? Number(values.value_est) : null,
      profit_est: values.profit_est ? Number(values.profit_est) : null,
      lead_source: values.lead_source || null,
      direction: (direction as 'north' | 'south' | 'east' | 'west') || null,
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-4 shadow-xl sm:p-6">
        <h2 className="mb-4 text-lg font-semibold text-stone-900">New job</h2>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700">Contact</label>
            {selectedContact ? (
              <div className="flex items-center justify-between rounded border border-stone-300 px-3 py-2 text-sm">
                <span>
                  {selectedContact.full_name}
                  {selectedContact.company && (
                    <span className="text-stone-500"> — {selectedContact.company.name}</span>
                  )}
                </span>
                <button
                  type="button"
                  className="text-sm text-stone-500 hover:text-stone-800"
                  onClick={() => {
                    setSelectedContact(null)
                    setValue('contact_id', '')
                  }}
                >
                  Change
                </button>
              </div>
            ) : (
              <ContactPicker
                onSelect={(c) => {
                  setSelectedContact(c)
                  setValue('contact_id', c.id, { shouldValidate: true })
                  // Auto-fill title as "Full Name - City" if title not yet set
                  if (!watch('title')) {
                    const city = c.city?.trim()
                    setValue('title', city ? `${c.full_name} - ${city}` : c.full_name)
                  }
                }}
              />
            )}
            {errors.contact_id && !contactId && (
              <p className="mt-1 text-sm text-red-600">{errors.contact_id.message}</p>
            )}
          </div>
          <div>
            <label htmlFor="title" className="mb-1 block text-sm font-medium text-stone-700">
              Title
            </label>
            <input
              id="title"
              placeholder="Jane - Mississauga"
              className="w-full rounded border border-stone-300 px-3 py-2 text-sm focus:border-amber-600 focus:outline-none"
              {...register('title')}
            />
            {errors.title && <p className="mt-1 text-sm text-red-600">{errors.title.message}</p>}
          </div>
          <div>
            <label htmlFor="summary" className="mb-1 block text-sm font-medium text-stone-700">
              Summary <span className="font-normal text-stone-400">(3–4 words, shown on card)</span>
            </label>
            <input
              id="summary"
              placeholder="Kitchen quartz countertops"
              className="w-full rounded border border-stone-300 px-3 py-2 text-sm focus:border-amber-600 focus:outline-none"
              {...register('summary')}
            />
            {errors.summary && <p className="mt-1 text-sm text-red-600">{errors.summary.message}</p>}
          </div>
          <div>
            <label htmlFor="site_address" className="mb-1 block text-sm font-medium text-stone-700">
              Site address
            </label>
            <input
              id="site_address"
              className="w-full rounded border border-stone-300 px-3 py-2 text-sm focus:border-amber-600 focus:outline-none"
              {...register('site_address')}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700">
              Direction <span className="font-normal text-stone-400">(from Toronto)</span>
            </label>
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value as typeof direction)}
              className="w-full rounded border border-stone-300 px-3 py-2 text-sm focus:border-amber-600 focus:outline-none"
            >
              <option value="">—</option>
              <option value="north">North</option>
              <option value="south">South</option>
              <option value="east">East</option>
              <option value="west">West</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="value_est" className="mb-1 block text-sm font-medium text-stone-700">
                Estimated value ($)
              </label>
              <input
                id="value_est"
                inputMode="decimal"
                className="w-full rounded border border-stone-300 px-3 py-2 text-sm focus:border-amber-600 focus:outline-none"
                {...register('value_est')}
              />
              {errors.value_est && (
                <p className="mt-1 text-sm text-red-600">{errors.value_est.message}</p>
              )}
            </div>
            <div>
              <label htmlFor="profit_est" className="mb-1 block text-sm font-medium text-stone-700">
                Estimated profit ($)
              </label>
              <input
                id="profit_est"
                inputMode="decimal"
                className="w-full rounded border border-stone-300 px-3 py-2 text-sm focus:border-amber-600 focus:outline-none"
                {...register('profit_est')}
              />
              {errors.profit_est && (
                <p className="mt-1 text-sm text-red-600">{errors.profit_est.message}</p>
              )}
            </div>
            {(() => {
              const margin = calcMargin(
                Number(watch('profit_est')) || null,
                Number(watch('value_est')) || null,
              )
              if (margin == null) return null
              return (
                <div className={`col-span-2 flex items-center justify-between rounded border px-3 py-2 text-sm font-semibold ${
                  margin > 50 ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : margin >= 30 ? 'border-amber-200 bg-amber-50 text-amber-700'
                  : 'border-red-200 bg-red-50 text-red-700'
                }`}>
                  <span>Estimated margin</span>
                  <span className={`tabular-nums ${marginColor(margin)}`}>{margin}%</span>
                </div>
              )
            })()}
            <div>
              <label className="mb-1 block text-sm font-medium text-stone-700">Lead source</label>
              <OptionSelect
                listKey="lead_sources"
                value={watch('lead_source') ?? ''}
                onChange={(v) => setValue('lead_source', v)}
              />
            </div>
          </div>
          {createJob.isError && (
            <p className="text-sm text-red-600">
              Could not create the job. {createJob.error.message}
            </p>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-stone-300 px-4 py-2 text-sm text-stone-700 hover:bg-stone-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
            >
              {isSubmitting ? 'Creating…' : 'Create job'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ContactPicker({ onSelect }: { onSelect: (c: ContactOption) => void }) {
  const [term, setTerm] = useState('')
  const [creating, setCreating] = useState(false)
  const { data: options, isPending, isError } = useContactSearch(term)

  if (creating) {
    return (
      <InlineContactForm
        initialName={term}
        onCreated={onSelect}
        onCancel={() => setCreating(false)}
      />
    )
  }

  return (
    <div>
      <input
        placeholder="Search contacts…"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        className="w-full rounded border border-stone-300 px-3 py-2 text-sm focus:border-amber-600 focus:outline-none"
      />
      <div className="mt-1 max-h-44 overflow-y-auto rounded border border-stone-200">
        {isPending && <p className="px-3 py-2 text-sm text-stone-500">Searching…</p>}
        {isError && <p className="px-3 py-2 text-sm text-red-600">Contact search failed.</p>}
        {options?.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelect(c)}
            className="block w-full px-3 py-2 text-left text-sm hover:bg-stone-50"
          >
            {c.full_name}
            {c.company && <span className="text-stone-500"> — {c.company.name}</span>}
          </button>
        ))}
        {options && options.length === 0 && (
          <p className="px-3 py-2 text-sm text-stone-500">No contacts match.</p>
        )}
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="block w-full border-t border-stone-200 px-3 py-2 text-left text-sm font-medium text-amber-700 hover:bg-amber-50"
        >
          + New contact{term.trim() ? ` “${term.trim()}”` : ''}
        </button>
      </div>
    </div>
  )
}

function InlineContactForm({
  initialName,
  onCreated,
  onCancel,
}: {
  initialName: string
  onCreated: (c: ContactOption) => void
  onCancel: () => void
}) {
  const createContact = useCreateContact()
  const [name, setName] = useState(initialName)
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [contactType, setContactType] = useState<ContactType | ''>('')
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!name.trim()) {
      setError('Name is required')
      return
    }
    const normalized = phone.trim() ? normalizePhone(phone) : null
    if (phone.trim() && !normalized) {
      setError('Enter a valid phone number')
      return
    }
    setError(null)
    try {
      const contact = await createContact.mutateAsync({
        full_name: name.trim(),
        phone: normalized,
        email: email.trim() || null,
        lead_source: null,
        contact_type: (contactType as ContactType) || null,
      })
      onCreated(contact)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the contact')
    }
  }

  return (
    <div className="space-y-2 rounded border border-stone-200 p-3">
      <p className="text-sm font-medium text-stone-700">New contact</p>
      <input
        placeholder="Full name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full rounded border border-stone-300 px-3 py-2 text-sm focus:border-amber-600 focus:outline-none"
      />
      <input
        placeholder="Phone"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        className="w-full rounded border border-stone-300 px-3 py-2 text-sm focus:border-amber-600 focus:outline-none"
      />
      <input
        placeholder="Email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full rounded border border-stone-300 px-3 py-2 text-sm focus:border-amber-600 focus:outline-none"
      />
      <div>
        <p className="mb-1 text-xs font-medium text-stone-600">Contact type</p>
        <div className="flex gap-3 text-sm">
          {(['homeowner', 'builder', 'contractor'] as ContactType[]).map((t) => (
            <label key={t} className="flex cursor-pointer items-center gap-1.5">
              <input
                type="radio"
                name="inline_contact_type"
                value={t}
                checked={contactType === t}
                onChange={() => setContactType(t)}
                className="accent-amber-600"
              />
              <span>{CONTACT_TYPE_LABELS[t]}</span>
            </label>
          ))}
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-stone-300 px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-50"
        >
          Back
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={createContact.isPending}
          className="rounded bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
        >
          {createContact.isPending ? 'Saving…' : 'Save contact'}
        </button>
      </div>
    </div>
  )
}
