import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'

export type ThreadChannel = 'sms' | 'messenger' | 'instagram'

export interface Message {
  id: string
  channel: ThreadChannel
  direction: 'inbound' | 'outbound'
  body: string | null
  status: string
  media_paths: string[] | null
  created_at: string
  error_code: string | null
}

/** Unified thread for one contact — SMS and Meta DMs interleaved, oldest
 *  first. Polls — an inbound reply appears within seconds without a
 *  realtime subscription. */
export function useThread(contactId: string) {
  return useQuery({
    queryKey: ['messages', 'thread', contactId],
    queryFn: async (): Promise<Message[]> => {
      const [smsRes, dmRes] = await Promise.all([
        supabase
          .from('messages')
          .select('id, direction, body, status, media_paths, created_at, error_code')
          .eq('contact_id', contactId),
        supabase
          .from('dm_messages')
          .select('id, direction, body, platform, created_at')
          .eq('contact_id', contactId),
      ])
      if (smsRes.error) throw smsRes.error
      if (dmRes.error) throw dmRes.error
      const sms: Message[] = smsRes.data.map((m) => ({ ...m, channel: 'sms' as const }))
      const dms: Message[] = dmRes.data.map((m) => ({
        id: m.id,
        channel: m.platform as ThreadChannel,
        direction: m.direction,
        body: m.body,
        status: 'received',
        media_paths: null,
        created_at: m.created_at,
        error_code: null,
      }))
      return [...sms, ...dms].sort((a, b) => a.created_at.localeCompare(b.created_at))
    },
    refetchInterval: 5000,
  })
}

/** The contact's linked Messenger/Instagram identity, if any. */
export function useDmIdentity(contactId: string) {
  return useQuery({
    queryKey: ['dm-identity', contactId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('channel_identities')
        .select('platform, external_id, display_name')
        .eq('contact_id', contactId)
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })
}

export function useSendDm(contactId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ body, jobId }: { body: string; jobId?: string }) => {
      const { data, error } = await supabase.functions.invoke('send-dm', {
        body: { contactId, jobId, body },
      })
      if (error) {
        const context = (error as { context?: Response }).context
        if (context) {
          const parsed = typeof context?.json === 'function' ? await context.json().catch(() => null) : null
          if (parsed?.error) throw new Error(parsed.error)
        }
        throw error
      }
      return data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['messages'] })
      void queryClient.invalidateQueries({ queryKey: ['activities'] })
    },
  })
}

export interface ThreadSummary {
  contact_id: string
  contact_name: string
  auto_created: boolean
  last_body: string | null
  last_direction: string
  last_at: string
  last_channel: ThreadChannel
}

/** Inbox: one row per contact with their latest message across SMS and DMs. */
export function useInbox() {
  return useQuery({
    queryKey: ['messages', 'inbox'],
    queryFn: async (): Promise<ThreadSummary[]> => {
      const select =
        'contact_id, body, direction, created_at, contact:contacts ( full_name, auto_created )'
      const [smsRes, dmRes] = await Promise.all([
        supabase.from('messages').select(select).order('created_at', { ascending: false }).limit(500),
        supabase
          .from('dm_messages')
          .select(`platform, ${select}`)
          .order('created_at', { ascending: false })
          .limit(500),
      ])
      if (smsRes.error) throw smsRes.error
      if (dmRes.error) throw dmRes.error
      interface Row {
        contact_id: string
        body: string | null
        direction: string
        created_at: string
        platform?: string
        contact: { full_name: string; auto_created: boolean } | null
      }
      const rows = [
        ...(smsRes.data as unknown as Row[]),
        ...(dmRes.data as unknown as Row[]),
      ].sort((a, b) => b.created_at.localeCompare(a.created_at))
      const seen = new Map<string, ThreadSummary>()
      for (const row of rows) {
        if (!seen.has(row.contact_id)) {
          seen.set(row.contact_id, {
            contact_id: row.contact_id,
            contact_name: row.contact?.full_name ?? 'Unknown',
            auto_created: row.contact?.auto_created ?? false,
            last_body: row.body,
            last_direction: row.direction,
            last_at: row.created_at,
            last_channel: (row.platform as ThreadChannel | undefined) ?? 'sms',
          })
        }
      }
      return [...seen.values()]
    },
    refetchInterval: 10000,
  })
}

export function useSendSms(contactId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ body, jobId }: { body: string; jobId?: string }) => {
      const { data, error } = await supabase.functions.invoke('send-sms', {
        body: { contactId, jobId, body },
      })
      if (error) {
        // Surface the function's JSON error (consent block, config missing).
        const context = (error as { context?: Response }).context
        if (context) {
          const parsed = typeof context?.json === 'function' ? await context.json().catch(() => null) : null
          if (parsed?.error) throw new Error(parsed.error)
        }
        throw error
      }
      return data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['messages'] })
      void queryClient.invalidateQueries({ queryKey: ['activities'] })
    },
  })
}

export function useStartCall() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ contactId, jobId }: { contactId: string; jobId?: string }) => {
      const { data, error } = await supabase.functions.invoke('call-bridge', {
        body: { contactId, jobId },
      })
      if (error) {
        const context = (error as { context?: Response }).context
        if (context) {
          const parsed = typeof context?.json === 'function' ? await context.json().catch(() => null) : null
          if (parsed?.error) throw new Error(parsed.error)
        }
        throw error
      }
      return data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['activities'] })
    },
  })
}

export async function commsFileUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('comms').createSignedUrl(path, 300)
  if (error) throw error
  return data.signedUrl
}

/** Calls for a job's timeline enrichment — recording playback. */
export function useJobCalls(jobId: string) {
  return useQuery({
    queryKey: ['calls', 'job', jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('calls')
        .select('id, activity_id, outcome, duration_seconds, recording_path, started_at')
        .eq('job_id', jobId)
      if (error) throw error
      return data
    },
  })
}
