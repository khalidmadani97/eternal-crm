import { useEffect, useRef, useState } from 'react'
import type { Call, Device } from '@twilio/voice-sdk'
import { supabase } from '../../../lib/supabase'

/** Feature flag (Slice 13, DECISIONS 023). With the flag off this component
 *  is never rendered and the SDK is never loaded. */
export const SOFTPHONE_ENABLED = import.meta.env.VITE_FEATURE_SOFTPHONE === 'true'

interface Props {
  contactId: string
  contactPhone: string
  jobId?: string
}

type CallState = 'idle' | 'connecting' | 'ringing' | 'in-call' | 'error'

export function SoftphoneButton({ contactId, contactPhone, jobId }: Props) {
  const [state, setState] = useState<CallState>('idle')
  const [error, setError] = useState<string | null>(null)
  const deviceRef = useRef<Device | null>(null)
  const callRef = useRef<Call | null>(null)

  useEffect(() => {
    return () => {
      callRef.current?.disconnect()
      deviceRef.current?.destroy()
    }
  }, [])

  const startCall = async () => {
    setState('connecting')
    setError(null)
    try {
      const { data, error: fnError } = await supabase.functions.invoke('voice-token', { body: {} })
      if (fnError) throw new Error('Could not get a voice token — is the softphone configured?')
      const { Device: TwilioDevice } = await import('@twilio/voice-sdk')
      const device = new TwilioDevice(data.token, { logLevel: 'error' })
      deviceRef.current = device
      const call = await device.connect({
        params: { To: contactPhone, contactId, ...(jobId ? { jobId } : {}) },
      })
      callRef.current = call
      setState('ringing')
      call.on('accept', () => setState('in-call'))
      call.on('disconnect', () => {
        setState('idle')
        device.destroy()
        deviceRef.current = null
      })
      call.on('error', (e: Error) => {
        setError(e.message)
        setState('error')
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Call failed')
      setState('error')
    }
  }

  const hangUp = () => {
    callRef.current?.disconnect()
    setState('idle')
  }

  if (state === 'in-call' || state === 'ringing') {
    return (
      <button
        onClick={hangUp}
        className="rounded bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800"
      >
        {state === 'ringing' ? 'Ringing… (hang up)' : '⏹ End call'}
      </button>
    )
  }
  return (
    <span className="inline-flex items-center gap-2">
      <button
        onClick={() => void startCall()}
        disabled={state === 'connecting'}
        className="rounded border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
      >
        {state === 'connecting' ? 'Connecting…' : '🎧 Browser call'}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  )
}
