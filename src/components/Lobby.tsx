import { useState } from 'react'
import { useAuth } from '../features/auth/AuthProvider'
import { useRegisterBusiness } from '../features/settings/api'

/** Where a signed-up user waits until they belong to a business (Slice 33):
 *  found one now, or get added by their admin. */
export function Lobby() {
  const { session, signOut } = useAuth()
  const registerBusiness = useRegisterBusiness()
  const [businessName, setBusinessName] = useState('')

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-100 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-8 text-center shadow">
        <h1 className="mb-2 text-xl font-semibold text-stone-900">Almost there</h1>
        <p className="mb-6 text-sm leading-relaxed text-stone-600">
          Your account isn't part of a business yet. Ask your admin to add{' '}
          <span className="font-medium text-stone-900">{session?.user.email}</span> in{' '}
          <span className="font-medium">Settings → Team</span> — or start your own business below.
        </p>
        <div className="mb-2 flex gap-2">
          <input
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            placeholder="Your business name…"
            className="flex-1 rounded border border-stone-300 px-3 py-2 text-sm focus:border-amber-600 focus:outline-none"
          />
          <button
            onClick={() =>
              registerBusiness.mutate(businessName.trim(), {
                onSuccess: () => window.location.assign('/home'),
              })
            }
            disabled={registerBusiness.isPending || !businessName.trim()}
            className="rounded bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
          >
            {registerBusiness.isPending ? 'Creating…' : 'Create business'}
          </button>
        </div>
        {registerBusiness.isError && (
          <p className="mb-2 text-sm text-red-600">{registerBusiness.error.message}</p>
        )}
        <p className="text-xs text-stone-400">
          Waiting to be added? This page refreshes your access automatically when you reload.
        </p>
        <button
          onClick={() => void signOut()}
          className="mt-4 text-sm text-stone-500 underline hover:text-stone-800"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
