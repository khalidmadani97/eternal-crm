import { useEffect, useState } from 'react'
import { useAuth } from '../features/auth/AuthProvider'
import { supabase } from '../lib/supabase'

// Push enrolment (Slice 14, DECISIONS 014). Android: works installed or in
// the browser. iOS: only after add-to-home-screen (16.4+); until then the
// button explains rather than failing silently.

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

export function PushToggle() {
  const { session } = useAuth()
  const [state, setState] = useState<'unsupported' | 'off' | 'on' | 'busy'>('unsupported')
  const [note, setNote] = useState<string | null>(null)
  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !vapidKey) return
    void navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription()
      setState(sub ? 'on' : 'off')
    })
  }, [vapidKey])

  if (state === 'unsupported') return null

  const enable = async () => {
    if (!session || !vapidKey) return
    setState('busy')
    setNote(null)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setNote('Notifications were blocked in the browser.')
        setState('off')
        return
      }
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey).buffer as ArrayBuffer,
      })
      const raw = sub.toJSON()
      const { error } = await supabase.from('push_subscriptions').upsert(
        {
          user_id: session.user.id,
          endpoint: sub.endpoint,
          p256dh: raw.keys?.p256dh ?? '',
          auth: raw.keys?.auth ?? '',
        },
        { onConflict: 'endpoint' },
      )
      if (error) throw error
      setState('on')
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Could not enable notifications')
      setState('off')
    }
  }

  const disable = async () => {
    setState('busy')
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
        await sub.unsubscribe()
      }
      setState('off')
    } catch {
      setState('on')
    }
  }

  return (
    <span className="flex items-center gap-2">
      <button
        onClick={() => void (state === 'on' ? disable() : enable())}
        disabled={state === 'busy'}
        title={state === 'on' ? 'Notifications on — click to disable' : 'Enable notifications'}
        className={`rounded border px-2 py-1.5 text-sm ${
          state === 'on'
            ? 'border-amber-300 bg-amber-50 text-amber-800'
            : 'border-stone-300 text-stone-500 hover:bg-stone-50'
        } disabled:opacity-50`}
      >
        {state === 'on' ? '🔔' : '🔕'}
      </button>
      {note && <span className="text-xs text-red-600">{note}</span>}
    </span>
  )
}
