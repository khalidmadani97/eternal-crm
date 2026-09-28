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

const magicSchema = z.object({ email: z.string().email('Enter a valid email') })
type MagicForm = z.infer<typeof magicSchema>

export function LoginPage() {
  const { session } = useAuth()
  const location = useLocation()
  const [mode, setMode] = useState<'password' | 'magic'>('password')

  if (session) {
    const from = (location.state as { from?: string } | null)?.from ?? '/jobs'
    return <Navigate to={from} replace />
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-100">
      <div className="w-full max-w-sm rounded-lg bg-white p-8 shadow">
        <h1 className="mb-1 text-xl font-semibold text-stone-900">Eternal CRM</h1>
        <p className="mb-6 text-sm text-stone-500">Sign in to continue</p>

        <div className="mb-5 flex rounded border border-stone-300 text-sm">
          <button
            type="button"
            onClick={() => setMode('password')}
            className={`flex-1 px-3 py-1.5 ${mode === 'password' ? 'bg-stone-900 text-white' : 'hover:bg-stone-50'}`}
          >
            Password
          </button>
          <button
            type="button"
            onClick={() => setMode('magic')}
            className={`flex-1 px-3 py-1.5 ${mode === 'magic' ? 'bg-stone-900 text-white' : 'hover:bg-stone-50'}`}
          >
            Email link
          </button>
        </div>

        {mode === 'password' ? <PasswordForm /> : <MagicLinkForm />}

        <p className="mt-4 text-center text-sm text-stone-500">
          New here?{' '}
          <Link to="/signup" className="text-amber-700 hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  )
}

function PasswordForm() {
  const [authError, setAuthError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) })

  const onSubmit = async (values: LoginForm) => {
    setAuthError(null)
    const { error } = await supabase.auth.signInWithPassword({
      email: values.email.trim(),
      password: values.password,
    })
    // Deliberately generic — never reveal whether the email exists.
    if (error) setAuthError('Invalid email or password')
  }

  return (
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
        <div className="mb-1 flex items-baseline justify-between">
          <label htmlFor="password" className="block text-sm font-medium text-stone-700">
            Password
          </label>
          <Link to="/forgot-password" className="text-xs text-amber-700 hover:underline">
            Forgot password?
          </Link>
        </div>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          className="w-full rounded border border-stone-300 px-3 py-2 text-sm focus:border-amber-600 focus:outline-none"
          {...register('password')}
        />
        {errors.password && <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>}
      </div>
      {authError && <p className="text-sm text-red-600">{authError}</p>}
      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded bg-stone-900 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
      >
        {isSubmitting ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}

function MagicLinkForm() {
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<MagicForm>({ resolver: zodResolver(magicSchema) })

  const onSubmit = async ({ email }: MagicForm) => {
    setError(null)
    const trimmed = email.trim()
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: {
        // Magic links must never create accounts — only invited/existing
        // users may sign in. This also stops the login page being abused to
        // seed junk accounts.
        shouldCreateUser: false,
        emailRedirectTo: `${window.location.origin}/home`,
      },
    })
    if (error) {
      setError(
        /rate|too many/i.test(error.message)
          ? 'Too many attempts — wait a few minutes and try again.'
          : error.message,
      )
      return
    }
    // Neutral confirmation regardless of whether the account exists.
    setSentTo(trimmed)
  }

  if (sentTo) {
    return (
      <div>
        <p className="text-sm text-stone-600">
          If an account exists for <span className="font-medium">{sentTo}</span>, we've sent a
          one-time sign-in link. Check your inbox (and spam) — it expires in 1 hour.
        </p>
        <button
          onClick={() => setSentTo(null)}
          className="mt-4 w-full rounded border border-stone-300 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
        >
          Use a different email
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <p className="text-xs text-stone-500">
        We'll email you a secure one-time link — no password needed.
      </p>
      <div>
        <label htmlFor="magic-email" className="mb-1 block text-sm font-medium text-stone-700">
          Email
        </label>
        <input
          id="magic-email"
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
        {isSubmitting ? 'Sending…' : 'Email me a login link'}
      </button>
    </form>
  )
}
