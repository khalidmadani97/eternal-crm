import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { OptionSelect } from '../../../components/OptionSelect'
import { useContactSearch, useCreateContact } from '../../contacts/api'
import type { ContactOption } from '../../contacts/api'
import { normalizePhone } from '../../../lib/format'
import { useCreateJob } from '../api'
import { newJobSchema } from '../schema'
import type { NewJobForm } from '../schema'

interface Props {
  onClose: () => void
}

export function NewJobDialog({ onClose }: Props) {
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

  const onSubmit = async (values: NewJobForm) => {
    await createJob.mutateAsync({
      contact_id: values.contact_id,
      title: values.title,
      site_address: values.site_address || null,
      value_est: values.value_est ? Number(values.value_est) : null,
      lead_source: values.lead_source || null,
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
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
              placeholder="Kitchen countertops — quartz"
              className="w-full rounded border border-stone-300 px-3 py-2 text-sm focus:border-amber-600 focus:outline-none"
              {...register('title')}
            />
            {errors.title && <p className="mt-1 text-sm text-red-600">{errors.title.message}</p>}
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
