import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../AuthProvider'

const loginSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
})

type LoginForm = z.infer<typeof loginSchema>

export function LoginPage() {
  const { session } = useAuth()
  const location = useLocation()
  const [authError, setAuthError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) })

  if (session) {
    const from = (location.state as { from?: string } | null)?.from ?? '/jobs'
    return <Navigate to={from} replace />
  }

  const onSubmit = async (values: LoginForm) => {
    setAuthError(null)
    const { error } = await supabase.auth.signInWithPassword(values)
    if (error) setAuthError('Invalid email or password')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-100">
      <div className="w-full max-w-sm rounded-lg bg-white p-8 shadow">
        <h1 className="mb-1 text-xl font-semibold text-stone-900">Eternal CRM</h1>
        <p className="mb-6 text-sm text-stone-500">Sign in to continue</p>
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
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-stone-700">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              className="w-full rounded border border-stone-300 px-3 py-2 text-sm focus:border-amber-600 focus:outline-none"
              {...register('password')}
            />
            {errors.password && (
              <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>
            )}
          </div>
          {authError && <p className="text-sm text-red-600">{authError}</p>}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded bg-stone-900 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
          >
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </button>
          <p className="text-center text-sm text-stone-500">
            New here?{' '}
            <Link to="/signup" className="text-amber-700 hover:underline">
              Create an account
            </Link>
          </p>
        </form>
      </div>
    </div>
  )
}
