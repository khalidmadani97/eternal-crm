import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../../lib/supabase'
import { formatDateTime } from '../../../lib/format'
import { switchBusiness, useInviteMember, useMyMembership } from '../api'

/** Platform-admin agency view (Slice 33, GHL-style): every business on the
 *  platform, with one-click entry. Ordinary users never see this. */
export function AgencyPage() {
  const { data: membership } = useMyMembership()
  const queryClient = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: '', adminEmail: '' })
  const invite = useInviteMember()
  const createClient = useMutation({
    mutationFn: async () => {
      const { data: businessId, error } = await supabase.rpc('create_client_business', {
        p_name: form.name.trim(),
      })
      if (error) throw error
      if (form.adminEmail.trim()) {
        await invite.mutateAsync({
          email: form.adminEmail.trim(),
          role: 'admin',
          businessId: businessId as string,
        })
      }
      return businessId
    },
    onSuccess: () => {
      setAdding(false)
      setForm({ name: '', adminEmail: '' })
      void queryClient.invalidateQueries({ queryKey: ['agency-businesses'] })
      void queryClient.invalidateQueries({ queryKey: ['my-membership'] })
    },
  })
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
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-stone-900">Agency</h1>
        <button
          onClick={() => setAdding(true)}
          className="rounded bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800"
        >
          + Add client
        </button>
      </div>
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
      {adding && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 className="mb-1 text-lg font-semibold text-stone-900">Add a client business</h2>
            <p className="mb-4 text-xs text-stone-500">
              A fresh workspace with default stages and lists. You join as admin (without leaving
              your current workspace); optionally add their first admin by email — existing accounts
              are added instantly, new people get a signup link.
            </p>
            <div className="space-y-3">
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-stone-700">Business name</span>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Granite Bros Ltd."
                  className="w-full rounded border border-stone-300 px-3 py-2 text-sm focus:border-amber-600 focus:outline-none"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-stone-700">
                  Client admin email <span className="font-normal text-stone-400">(optional)</span>
                </span>
                <input
                  type="email"
                  value={form.adminEmail}
                  onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
                  placeholder="owner@granitebros.ca"
                  className="w-full rounded border border-stone-300 px-3 py-2 text-sm focus:border-amber-600 focus:outline-none"
                />
              </label>
            </div>
            {createClient.isError && (
              <p className="mt-2 text-sm text-red-600">{createClient.error.message}</p>
            )}
            {invite.isSuccess && invite.data.invited && !invite.data.emailed && invite.data.link && (
              <p className="mt-2 flex items-center gap-2 rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                Invite created — email them this link:
                <button
                  onClick={() => void navigator.clipboard.writeText(invite.data.link!)}
                  className="rounded border border-emerald-300 px-2 py-0.5 text-xs font-medium hover:bg-emerald-100"
                >
                  Copy link
                </button>
              </p>
            )}
            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={() => setAdding(false)}
                className="rounded border border-stone-300 px-4 py-2 text-sm text-stone-700 hover:bg-stone-50"
              >
                Cancel
              </button>
              <button
                onClick={() => createClient.mutate()}
                disabled={createClient.isPending || !form.name.trim()}
                className="rounded bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
              >
                {createClient.isPending ? 'Creating…' : 'Create client'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
