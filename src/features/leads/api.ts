import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'

// Lead-sheet integrations (Slice 39): Google Sheets fed by Meta Lead Ads /
// Google Forms, synced into the pipeline by the sync-lead-sheets function.

export interface LeadSheet {
  id: string
  name: string
  provider: string
  sheet_url: string
  last_synced_at: string | null
  last_error: string | null
  rows_imported: number
  active: boolean
}

export function useLeadSheets() {
  return useQuery({
    queryKey: ['lead-sheets'],
    queryFn: async (): Promise<LeadSheet[]> => {
      const { data, error } = await supabase
        .from('lead_sheets')
        .select('id, name, provider, sheet_url, last_synced_at, last_error, rows_imported, active')
        .order('created_at')
      if (error) throw error
      return data as LeadSheet[]
    },
  })
}

async function invokeSync(body: object) {
  const { data, error } = await supabase.functions.invoke('sync-lead-sheets', { body })
  if (error) {
    const context = (error as { context?: Response }).context
    if (context) {
      const parsed = await context.json().catch(() => null)
      if (parsed?.error) throw new Error(parsed.error)
    }
    throw error
  }
  return data
}

export function useAddLeadSheet() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { name: string; provider: string; sheet_url: string }) => {
      // Validate + map before saving so a bad link fails loudly here.
      await invokeSync({ action: 'preview', sheetUrl: input.sheet_url })
      const { error } = await supabase.from('lead_sheets').insert({
        ...input,
        provider: input.provider as 'meta' | 'google_ads' | 'website' | 'other',
      })
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['lead-sheets'] }),
  })
}

export function useDeleteLeadSheet() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('lead_sheets').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['lead-sheets'] }),
  })
}

export interface SyncResult {
  results: { sheet: string; imported?: number; total?: number; error?: string }[]
}

export function useSyncLeadSheets() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (sheetId?: string): Promise<SyncResult> =>
      (await invokeSync({ action: 'sync', ...(sheetId ? { sheetId } : {}) })) as SyncResult,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['lead-sheets'] })
      void queryClient.invalidateQueries({ queryKey: ['jobs'] })
      void queryClient.invalidateQueries({ queryKey: ['contacts'] })
    },
  })
}
