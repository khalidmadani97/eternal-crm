import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'

/** Request a password reset. Supabase emails a recovery link that lands on
 *  /reset-password (see ResetPasswordPage + the PASSWORD_RECOVERY handler in
 *  AuthProvider). We always show the same confirmation to avoid revealing
 *  whether an email has an account. */
const schema = z.object({ email: z.string().email('Enter a valid email') })
type ForgotForm = z.infer<typeof schema>

export function ForgotPasswordPage() {
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotForm>({ resolver: zodResolver(schema) })

  const onSubmit = async ({ email }: ForgotForm) => {
    setError(null)
    const trimmed = email.trim()
    const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) {
      setError(
        /rate|too many/i.test(error.message)
          ? 'Too many attempts — wait a few minutes and try again.'
          : error.message,
      )
      return
    }
    setSentTo(trimmed)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-100">
      <div className="w-full max-w-sm rounded-lg bg-white p-8 shadow">
        <h1 className="mb-1 text-xl font-semibold text-stone-900">Reset your password</h1>
        {sentTo ? (
          <>
            <p className="mb-6 mt-4 text-sm text-stone-600">
              If an account exists for <span className="font-medium">{sentTo}</span>, we've sent a
              link to reset the password. Check your inbox (and spam) — the link expires in 1 hour.
            </p>
            <Link
              to="/login"
              className="block w-full rounded bg-stone-900 py-2 text-center text-sm font-medium text-white hover:bg-stone-800"
            >
              Back to sign in
            </Link>
          </>
        ) : (
          <>
            <p className="mb-6 text-sm text-stone-500">
              Enter your email and we'll send you a link to set a new password.
            </p>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
              <div>
                <label htmlFor="email" className="mb-1 block text-sm font-medium text-stone-700">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  className="w-full rounded border border-stone-300 px-3 py-2 text-sm focus:border-amber-600 focus:outline-none"
                  {...register('email')}
                />
                {errors.email && <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>}
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded bg-stone-900 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
              >
                {isSubmitting ? 'Sending…' : 'Send reset link'}
              </button>
              <p className="text-center text-sm text-stone-500">
                Remembered it?{' '}
                <Link to="/login" className="text-amber-700 hover:underline">
                  Sign in
                </Link>
              </p>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
