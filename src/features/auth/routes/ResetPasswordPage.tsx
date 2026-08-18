import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../AuthProvider'

/** Land here from the emailed recovery link. Supabase's detectSessionInUrl
 *  turns the link into a session (and AuthProvider routes PASSWORD_RECOVERY
 *  here), so a present session means the link was valid — show the new-password
 *  form. No session means the link is missing, used, or expired. */
export function ResetPasswordPage() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [done, setDone] = useState(false)

  const card = (children: React.ReactNode) => (
    <div className="flex min-h-screen items-center justify-center bg-stone-100">
      <div className="w-full max-w-sm rounded-lg bg-white p-8 shadow">{children}</div>
    </div>
  )

  if (loading) return card(<p className="py-2 text-sm text-stone-500">Loading…</p>)

  if (!session) {
    return card(
      <>
        <h1 className="mb-1 text-xl font-semibold text-stone-900">Link expired</h1>
        <p className="mb-6 mt-4 text-sm text-stone-600">
          This password reset link is invalid or has expired. Request a fresh one to try again.
        </p>
        <Link
          to="/forgot-password"
          className="block w-full rounded bg-stone-900 py-2 text-center text-sm font-medium text-white hover:bg-stone-800"
        >
          Request a new link
        </Link>
      </>,
    )
  }

  if (done) {
    return card(
      <>
        <h1 className="mb-1 text-xl font-semibold text-stone-900">Password updated ✓</h1>
        <p className="mt-4 text-sm text-stone-600">Signing you in…</p>
      </>,
    )
  }

  const submit = async () => {
    setError(null)
    if (password.length < 12) {
      setError('Use 12+ characters with letters and numbers.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setPending(true)
    const { error } = await supabase.auth.updateUser({ password })
    setPending(false)
    if (error) {
      setError(error.message)
      return
    }
    setDone(true)
    setTimeout(() => void navigate('/home'), 1200)
  }

  const inputClass =
    'w-full rounded border border-stone-300 px-3 py-2 text-sm focus:border-amber-600 focus:outline-none'

  return card(
    <>
      <h1 className="mb-1 text-xl font-semibold text-stone-900">Set a new password</h1>
      <p className="mb-6 text-sm text-stone-500">Choose a new password for your account.</p>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
        className="space-y-4"
        noValidate
      >
        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-medium text-stone-700">
            New password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
          <span className="mt-1 block text-xs text-stone-400">12+ characters with letters and numbers.</span>
        </div>
        <div>
          <label htmlFor="confirm" className="mb-1 block text-sm font-medium text-stone-700">
            Confirm password
          </label>
          <input
            id="confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={inputClass}
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded bg-stone-900 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Update password'}
        </button>
      </form>
    </>,
  )
}
