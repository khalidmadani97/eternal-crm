import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'

export interface Message {
  id: string
  direction: 'inbound' | 'outbound'
  body: string | null
  status: string
  from_number: string
  to_number: string
  media_paths: string[] | null
  created_at: string
  delivered_at: string | null
  error_code: string | null
}

/** Thread for one contact, oldest first. Polls — an inbound reply appears
 *  within seconds without a realtime subscription. */
export function useThread(contactId: string) {
  return useQuery({
    queryKey: ['messages', 'thread', contactId],
    queryFn: async (): Promise<Message[]> => {
      const { data, error } = await supabase
        .from('messages')
        .select(
          'id, direction, body, status, from_number, to_number, media_paths, created_at, delivered_at, error_code',
        )
        .eq('contact_id', contactId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as Message[]
    },
    refetchInterval: 5000,
  })
}

export interface ThreadSummary {
  contact_id: string
  contact_name: string
  auto_created: boolean
  last_body: string | null
  last_direction: string
  last_at: string
}

/** Inbox: one row per contact with their latest message. */
export function useInbox() {
  return useQuery({
    queryKey: ['messages', 'inbox'],
    queryFn: async (): Promise<ThreadSummary[]> => {
      const { data, error } = await supabase
        .from('messages')
        .select('contact_id, body, direction, created_at, contact:contacts ( full_name, auto_created )')
        .order('created_at', { ascending: false })
        .limit(500)
      if (error) throw error
      const seen = new Map<string, ThreadSummary>()
      for (const row of data as unknown as {
        contact_id: string
        body: string | null
        direction: string
        created_at: string
        contact: { full_name: string; auto_created: boolean } | null
      }[]) {
        if (!seen.has(row.contact_id)) {
          seen.set(row.contact_id, {
            contact_id: row.contact_id,
            contact_name: row.contact?.full_name ?? 'Unknown',
            auto_created: row.contact?.auto_created ?? false,
            last_body: row.body,
            last_direction: row.direction,
            last_at: row.created_at,
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
          const parsed = await context.json().catch(() => null)
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
          const parsed = await context.json().catch(() => null)
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
