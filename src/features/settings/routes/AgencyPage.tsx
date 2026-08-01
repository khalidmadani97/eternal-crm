import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../../lib/supabase'
import { formatDateTime } from '../../../lib/format'
import { switchBusiness, useMyMembership } from '../api'

/** Platform-admin agency view (Slice 33, GHL-style): every business on the
 *  platform, with one-click entry. Ordinary users never see this. */
export function AgencyPage() {
  const { data: membership } = useMyMembership()
  const { data: businesses, isPending, isError, error } = useQuery({
    queryKey: ['agency-businesses'],
    queryFn: async () => {
      const [bizRes, membersRes] = await Promise.all([
        supabase.from('businesses').select('id, name, created_at').order('created_at'),
        supabase.from('business_members').select('business_id, status'),
      ])
      if (bizRes.error) throw bizRes.error
      if (membersRes.error) throw membersRes.error
      return bizRes.data.map((b) => ({
        ...b,
        members: membersRes.data.filter((m) => m.business_id === b.id && m.status === 'active').length,
      }))
    },
  })

  if (membership && !membership.platformAdmin) {
    return <p className="py-12 text-center text-stone-500">This area is for the platform team.</p>
  }

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-stone-900">Agency</h1>
      <p className="mb-4 text-sm text-stone-500">
        Every business on the platform. Entering one scopes the whole app to its data.
      </p>
      {isPending && <p className="py-8 text-center text-stone-500">Loading businesses…</p>}
      {isError && <p className="py-8 text-center text-red-600">Could not load. {error.message}</p>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {businesses?.map((b) => {
          const active = membership?.activeBusinessId === b.id
          return (
            <div
              key={b.id}
              className={`rounded-lg border bg-white p-4 ${
                active ? 'border-amber-400 ring-1 ring-amber-200' : 'border-stone-200'
              }`}
            >
              <div className="mb-1 flex items-center justify-between">
                <h2 className="font-semibold text-stone-900">{b.name}</h2>
                {active && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                    current
                  </span>
                )}
              </div>
              <p className="mb-3 text-xs text-stone-400">
                {b.members} member{b.members === 1 ? '' : 's'} · since {formatDateTime(b.created_at)}
              </p>
              <button
                onClick={() => void switchBusiness(b.id)}
                disabled={active}
                className="w-full rounded bg-stone-900 py-1.5 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-40"
              >
                {active ? 'You are here' : 'Enter workspace'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
