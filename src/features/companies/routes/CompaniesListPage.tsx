import { useState } from 'react'
import { Link } from 'react-router-dom'
import { PeopleTabs } from '../../contacts/routes/ContactsListPage'
import { formatPhone } from '../../../lib/format'
import { COMPANY_TYPE_LABELS, useCompanies, useCreateCompany } from '../api'
import { CompanyForm } from '../components/CompanyForm'

export function CompaniesListPage() {
  const { data: companies, isPending, isError, error, refetch } = useCompanies()
  const createCompany = useCreateCompany()
  const [showNew, setShowNew] = useState(false)

  return (
    <div>
      <PeopleTabs />
      <div className="mb-4 flex justify-end">
        <button
          onClick={() => setShowNew(true)}
          className="rounded bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800"
        >
          New company
        </button>
      </div>

      {isPending && <p className="py-12 text-center text-stone-500">Loading companies…</p>}
      {isError && (
        <div className="py-12 text-center">
          <p className="mb-2 text-red-600">Could not load companies. {error.message}</p>
          <button
            onClick={() => void refetch()}
            className="rounded border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-50"
          >
            Retry
          </button>
        </div>
      )}
      {companies && companies.length === 0 && (
        <p className="py-12 text-center text-stone-500">No companies yet.</p>
      )}

      {companies && companies.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Email</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => (
                <tr key={c.id} className="border-b border-stone-100 last:border-0 hover:bg-stone-50">
                  <td className="px-4 py-3 font-medium">
                    <Link to={`/companies/${c.id}`} className="text-stone-900 hover:text-amber-700 hover:underline">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{COMPANY_TYPE_LABELS[c.type]}</td>
                  <td className="px-4 py-3 tabular-nums">{formatPhone(c.phone)}</td>
                  <td className="px-4 py-3">{c.email ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showNew && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-4 shadow-xl sm:p-6">
            <h2 className="mb-4 text-lg font-semibold text-stone-900">New company</h2>
            <CompanyForm
              submitting={createCompany.isPending}
              submitLabel="Create company"
              error={createCompany.isError ? createCompany.error.message : null}
              onCancel={() => setShowNew(false)}
              onSubmit={(input) => {
                createCompany.mutate(input, { onSuccess: () => setShowNew(false) })
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
