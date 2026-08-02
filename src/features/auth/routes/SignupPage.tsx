import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'

/** Public signup (Slice 33). Anyone can create an account; they either
 *  found a new business (becoming its admin) or wait in the lobby until a
 *  business admin adds their email. */
export function SignupPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const inviteToken = params.get('invite')
  const [form, setForm] = useState({ name: '', email: '', password: '', businessName: '' })
  const [mode, setMode] = useState<'create' | 'join'>('create')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const submit = async () => {
    setError(null)
    if (!form.name.trim() || !form.email.trim() || form.password.length < 12) {
      setError('Name, email, and a 12+ character password (letters and numbers) are required.')
      return
    }
    if (!inviteToken && mode === 'create' && !form.businessName.trim()) {
      setError('Enter your business name (or choose “join an existing business”).')
      return
    }
    setPending(true)
    try {
      const { error: signUpError } = await supabase.auth.signUp({
        email: form.email.trim(),
        password: form.password,
        options: { data: { full_name: form.name.trim() } },
      })
      if (signUpError) throw signUpError
      if (inviteToken) {
        const { error: acceptError } = await supabase.functions.invoke('invite', {
          body: { action: 'accept', token: inviteToken },
        })
        if (acceptError) {
          const context = (acceptError as { context?: Response }).context
          const parsed = context ? await context.json().catch(() => null) : null
          throw new Error(parsed?.error ?? 'This invite could not be applied — ask for a fresh link.')
        }
      } else if (mode === 'create') {
        const { error: bizError } = await supabase.rpc('register_business', {
          p_name: form.businessName.trim(),
        })
        if (bizError) throw bizError
      }
      void navigate('/home')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign up failed')
    } finally {
      setPending(false)
    }
  }

  const inputClass =
    'w-full rounded border border-stone-300 px-3 py-2 text-sm focus:border-amber-600 focus:outline-none'

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-100">
      <div className="w-full max-w-sm rounded-lg bg-white p-8 shadow">
        <h1 className="mb-1 text-xl font-semibold text-stone-900">Create your account</h1>
        <p className="mb-6 text-sm text-stone-500">
          {inviteToken ? "You've been invited — finish signing up to join your team." : 'Eternal CRM'}
        </p>
        <div className="space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-stone-700">Your name</span>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-stone-700">Email</span>
            <input type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputClass} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-stone-700">Password</span>
            <input type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className={inputClass} />
            <span className="mt-1 block text-xs text-stone-400">12+ characters with letters and numbers.</span>
          </label>

          {!inviteToken && (
          <div className="flex rounded border border-stone-300 text-sm">
            <button
              onClick={() => setMode('create')}
              className={`flex-1 px-3 py-1.5 ${mode === 'create' ? 'bg-stone-900 text-white' : 'hover:bg-stone-50'}`}
            >
              New business
            </button>
            <button
              onClick={() => setMode('join')}
              className={`flex-1 px-3 py-1.5 ${mode === 'join' ? 'bg-stone-900 text-white' : 'hover:bg-stone-50'}`}
            >
              Join existing
            </button>
          </div>
          )}
          {!inviteToken && (mode === 'create' ? (
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-stone-700">Business name</span>
              <input
                value={form.businessName}
                onChange={(e) => setForm({ ...form, businessName: e.target.value })}
                placeholder="Eternal Interiors"
                className={inputClass}
              />
              <span className="mt-1 block text-xs text-stone-400">You'll be its first admin.</span>
            </label>
          ) : (
            <p className="rounded bg-stone-50 px-3 py-2 text-xs leading-relaxed text-stone-500">
              After signing up, ask your business admin to add your email in{' '}
              <span className="font-medium">Settings → Team</span>. You'll get access the moment
              they do.
            </p>
          ))}

          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            onClick={() => void submit()}
            disabled={pending}
            className="w-full rounded bg-stone-900 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
          >
            {pending ? 'Creating account…' : 'Create account'}
          </button>
          <p className="text-center text-sm text-stone-500">
            Already have an account?{' '}
            <Link to="/login" className="text-amber-700 hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
