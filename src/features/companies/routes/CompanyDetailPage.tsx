import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { StageBadge } from '../../jobs/components/StageBadge'
import type { JobStage } from '../../jobs/api'
import { formatCurrency, formatDate, formatPhone } from '../../../lib/format'
import {
  COMPANY_TYPE_LABELS,
  referredTotal,
  useCompany,
  useSoftDeleteCompany,
  useUpdateCompany,
} from '../api'
import { CompanyForm } from '../components/CompanyForm'

export function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: company, isPending, isError, error, refetch } = useCompany(id!)
  const updateCompany = useUpdateCompany()
  const softDelete = useSoftDeleteCompany()
  const [editing, setEditing] = useState(false)

  if (isPending) return <p className="py-12 text-center text-stone-500">Loading company…</p>
  if (isError)
    return (
      <div className="py-12 text-center">
        <p className="mb-2 text-red-600">Could not load the company. {error.message}</p>
        <button
          onClick={() => void refetch()}
          className="rounded border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-50"
        >
          Retry
        </button>
      </div>
    )

  const total = referredTotal(company.jobs)

  return (
    <div>
      <Link to="/companies" className="text-sm text-stone-500 hover:text-stone-800">
        ← Companies
      </Link>
      <div className="mt-2 flex items-center gap-4">
        <h1 className="text-xl font-semibold text-stone-900">{company.name}</h1>
        <span className="rounded bg-stone-200 px-2 py-0.5 text-xs text-stone-700">
          {COMPANY_TYPE_LABELS[company.type]}
        </span>
        <button
          onClick={() => setEditing(true)}
          className="ml-auto rounded border border-stone-300 px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-50"
        >
          Edit
        </button>
        <button
          onClick={() => {
            if (window.confirm(`Archive ${company.name}? Contacts and jobs are kept.`))
              softDelete.mutate(company.id, { onSuccess: () => void navigate('/companies') })
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
        <div className="space-y-4">
          <section className="rounded-lg border border-stone-200 bg-white p-4 text-sm">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">
              Details
            </h2>
            <dl className="space-y-2">
              <Row label="Phone" value={formatPhone(company.phone)} />
              <Row label="Email" value={company.email ?? '—'} />
              <Row label="Address" value={company.address ?? '—'} />
              <Row label="Notes" value={company.notes ?? '—'} />
            </dl>
          </section>
          <section className="rounded-lg border border-stone-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">
              Contacts ({company.contacts.length})
            </h2>
            {company.contacts.length === 0 && (
              <p className="text-sm text-stone-500">No contacts.</p>
            )}
            <ul className="space-y-2 text-sm">
              {company.contacts.map((c) => (
                <li key={c.id}>
                  <Link to={`/contacts/${c.id}`} className="font-medium text-stone-900 hover:text-amber-700 hover:underline">
                    {c.full_name}
                  </Link>
                  <p className="text-xs text-stone-400">
                    {formatPhone(c.phone)}
                    {c.email ? ` · ${c.email}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <section className="rounded-lg border border-stone-200 bg-white p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">
              Referred jobs ({company.jobs.length})
            </h2>
            <p className="text-sm text-stone-600">
              Total referred value:{' '}
              <span className="font-semibold tabular-nums text-stone-900">
                {formatCurrency(total)}
              </span>
            </p>
          </div>
          {company.jobs.length === 0 && (
            <p className="text-sm text-stone-500">No referred jobs.</p>
          )}
          {company.jobs.length > 0 && (
            <table className="w-full text-sm">
              <tbody>
                {company.jobs
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
      </div>

      {editing && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-4 shadow-xl sm:p-6">
            <h2 className="mb-4 text-lg font-semibold text-stone-900">Edit company</h2>
            <CompanyForm
              initial={company}
              submitting={updateCompany.isPending}
              submitLabel="Save"
              error={updateCompany.isError ? updateCompany.error.message : null}
              onCancel={() => setEditing(false)}
              onSubmit={(input) => {
                updateCompany.mutate(
                  { id: company.id, input },
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
