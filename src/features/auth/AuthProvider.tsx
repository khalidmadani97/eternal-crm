import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'

interface AuthContextValue {
  session: Session | null
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      // A locally stored session can outlive its server user (e.g. after a
      // local db reset). Validate once; if the server rejects it, clear it
      // so the app lands on login instead of erroring everywhere.
      if (data.session) {
        const { error } = await supabase.auth.getUser()
        if (error) {
          await supabase.auth.signOut()
          setSession(null)
          setLoading(false)
          return
        }
      }
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next)
      // Recovery links land the user in a session; send them to set a new
      // password even if Supabase redirected to the site root as a fallback.
      if (event === 'PASSWORD_RECOVERY') navigate('/reset-password')
    })
    return () => sub.subscription.unsubscribe()
  }, [navigate])

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
