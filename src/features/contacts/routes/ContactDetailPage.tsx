import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { StageBadge } from '../../jobs/components/StageBadge'
import type { JobStage } from '../../jobs/api'
import { formatCurrency, formatDate, formatPhone } from '../../../lib/format'
import { useContact, useSoftDeleteContact, useUpdateContact } from '../api'
import { ContactForm } from '../components/ContactForm'
import { ContactTimeline } from '../components/ContactTimeline'

export function ContactDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: contact, isPending, isError, error, refetch } = useContact(id!)
  const updateContact = useUpdateContact()
  const softDelete = useSoftDeleteContact()
  const [editing, setEditing] = useState(false)

  if (isPending) return <p className="py-12 text-center text-stone-500">Loading contact…</p>
  if (isError)
    return (
      <div className="py-12 text-center">
        <p className="mb-2 text-red-600">Could not load the contact. {error.message}</p>
        <button
          onClick={() => void refetch()}
          className="rounded border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-50"
        >
          Retry
        </button>
      </div>
    )

  return (
    <div>
      <Link to="/contacts" className="text-sm text-stone-500 hover:text-stone-800">
        ← Contacts
      </Link>
      <div className="mt-2 flex items-center gap-4">
        <h1 className="text-xl font-semibold text-stone-900">{contact.full_name}</h1>
        {contact.auto_created && (
          <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
            unverified — created by inbound comms
          </span>
        )}
        <button
          onClick={() => setEditing(true)}
          className="ml-auto rounded border border-stone-300 px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-50"
        >
          Edit
        </button>
        <button
          onClick={() => {
            if (window.confirm(`Archive ${contact.full_name}? Their jobs are kept.`))
              softDelete.mutate(contact.id, { onSuccess: () => void navigate('/contacts') })
          }}
          disabled={softDelete.isPending}
          className="rounded border border-red-200 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
        >
          Archive
        </button>
      </div>
      {softDelete.isError && (
        <p className="mt-2 text-sm text-red-600">Archive failed. {softDelete.error.message}</p>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-[20rem_1fr]">
        <section className="rounded-lg border border-stone-200 bg-white p-4 text-sm">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">
            Details
          </h2>
          <dl className="space-y-2">
            <Row label="Phone" value={formatPhone(contact.phone)} />
            <Row label="Email" value={contact.email ?? '—'} />
            <Row label="Address" value={contact.address ?? '—'} />
            <Row
              label="Company"
              value={
                contact.company ? (
                  <Link to={`/companies/${contact.company.id}`} className="text-amber-700 hover:underline">
                    {contact.company.name}
                  </Link>
                ) : (
                  '—'
                )
              }
            />
            <Row label="Lead source" value={contact.lead_source ?? '—'} />
            <Row label="Notes" value={contact.notes ?? '—'} />
          </dl>
        </section>

        <div className="space-y-4">
        <section className="rounded-lg border border-stone-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">
            Jobs ({contact.jobs.length})
          </h2>
          {contact.jobs.length === 0 && <p className="text-sm text-stone-500">No jobs yet.</p>}
          {contact.jobs.length > 0 && (
            <table className="w-full text-sm">
              <tbody>
                {contact.jobs
                  .slice()
                  .sort((a, b) => b.created_at.localeCompare(a.created_at))
                  .map((j) => (
                    <tr key={j.id} className="border-b border-stone-100 last:border-0">
                      <td className="py-2 pr-3 font-medium">
                        <Link to={`/jobs/${j.id}`} className="text-stone-900 hover:text-amber-700 hover:underline">
                          {j.job_number}
                        </Link>
                      </td>
                      <td className="py-2 pr-3">{j.title}</td>
                      <td className="py-2 pr-3">
                        <StageBadge stage={j.stage as JobStage} />
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {formatCurrency(j.value_final ?? j.value_est)}
                      </td>
                      <td className="py-2 text-right text-xs text-stone-400">
                        {formatDate(j.created_at)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </section>
        <ContactTimeline contactId={contact.id} />
        </div>
      </div>

      {editing && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold text-stone-900">Edit contact</h2>
            <ContactForm
              initial={contact}
              submitting={updateContact.isPending}
              submitLabel="Save"
              error={updateContact.isError ? updateContact.error.message : null}
              onCancel={() => setEditing(false)}
              onSubmit={(input) => {
                const patch = contact.auto_created ? { ...input, auto_created: false } : input
                updateContact.mutate(
                  { id: contact.id, input: patch },
                  { onSuccess: () => setEditing(false) },
                )
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-stone-400">{label}</dt>
      <dd className="text-stone-800">{value}</dd>
    </div>
  )
}
