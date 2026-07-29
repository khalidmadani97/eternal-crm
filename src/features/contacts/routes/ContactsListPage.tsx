import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { formatPhone } from '../../../lib/format'
import { useContacts, useCreateFullContact } from '../api'
import { ContactForm } from '../components/ContactForm'

export function PeopleTabs() {
  const tabClass = ({ isActive }: { isActive: boolean }) =>
    `rounded px-3 py-1.5 text-sm font-medium ${
      isActive ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-200'
    }`
  return (
    <div className="mb-4 flex gap-2">
      <NavLink to="/contacts" end className={tabClass}>
        Contacts
      </NavLink>
      <NavLink to="/companies" end className={tabClass}>
        Companies
      </NavLink>
    </div>
  )
}

export function ContactsListPage() {
  const [showUnverified, setShowUnverified] = useState(false)
  const { data: contacts, isPending, isError, error, refetch } = useContacts(showUnverified)
  const createContact = useCreateFullContact()
  const [showNew, setShowNew] = useState(false)
  const [search, setSearch] = useState('')

  const visible = contacts?.filter((c) => {
    const term = search.trim().toLowerCase()
    if (!term) return true
    return `${c.full_name} ${c.email ?? ''} ${c.phone ?? ''} ${c.company?.name ?? ''}`
      .toLowerCase()
      .includes(term)
  })

  return (
    <div>
      <PeopleTabs />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          placeholder="Search contacts…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64 rounded border border-stone-300 bg-white px-3 py-1.5 text-sm focus:border-amber-600 focus:outline-none"
        />
        <label className="flex items-center gap-1.5 text-sm text-stone-600">
          <input
            type="checkbox"
            checked={showUnverified}
            onChange={(e) => setShowUnverified(e.target.checked)}
            className="h-4 w-4 accent-amber-600"
          />
          Show unverified
        </label>
        <button
          onClick={() => setShowNew(true)}
          className="ml-auto rounded bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800"
        >
          New contact
        </button>
      </div>

      {isPending && <p className="py-12 text-center text-stone-500">Loading contacts…</p>}
      {isError && (
        <div className="py-12 text-center">
          <p className="mb-2 text-red-600">Could not load contacts. {error.message}</p>
          <button
            onClick={() => void refetch()}
            className="rounded border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-50"
          >
            Retry
          </button>
        </div>
      )}
      {visible && visible.length === 0 && (
        <p className="py-12 text-center text-stone-500">
          {contacts && contacts.length === 0 ? 'No contacts yet.' : 'No contacts match.'}
        </p>
      )}

      {visible && visible.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Lead source</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => (
                <tr key={c.id} className="border-b border-stone-100 last:border-0 hover:bg-stone-50">
                  <td className="px-4 py-3 font-medium">
                    <Link to={`/contacts/${c.id}`} className="text-stone-900 hover:text-amber-700 hover:underline">
                      {c.full_name}
                    </Link>
                    {c.auto_created && (
                      <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">
                        unverified
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {c.company ? (
                      <Link to={`/companies/${c.company.id}`} className="text-amber-700 hover:underline">
                        {c.company.name}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{formatPhone(c.phone)}</td>
                  <td className="px-4 py-3">{c.email ?? '—'}</td>
                  <td className="px-4 py-3">{c.lead_source ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showNew && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold text-stone-900">New contact</h2>
            <NewContactBody onDone={() => setShowNew(false)} createContact={createContact} />
          </div>
        </div>
      )}
    </div>
  )
}

function NewContactBody({
  onDone,
  createContact,
}: {
  onDone: () => void
  createContact: ReturnType<typeof useCreateFullContact>
}) {
  return (
    <ContactForm
      submitting={createContact.isPending}
      submitLabel="Create contact"
      error={createContact.isError ? createContact.error.message : null}
      onCancel={onDone}
      onSubmit={(input) => {
        createContact.mutate(input, { onSuccess: onDone })
      }}
    />
  )
}
