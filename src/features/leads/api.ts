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
      const parsed = typeof context?.json === 'function' ? await context.json().catch(() => null) : null
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


export interface LeadSearchResult {
  jobId: string
  jobNumber: string
  title: string
  stage: string
  parsedName: string | null
  parsedPhone: string | null
  contactName: string | null
}

export function useSearchLeads(term: string) {
  return useQuery({
    queryKey: ['leads', 'search', term],
    enabled: term.trim().length >= 2,
    queryFn: async (): Promise<LeadSearchResult[]> => {
      const q = term.trim()

      // 1. Search inbound_leads by parsed name/phone/email → covers all sheet leads
      const { data: inboundRows } = await supabase
        .from('inbound_leads')
        .select('job_id, parsed_name, parsed_phone')
        .or(`parsed_name.ilike.%${q}%,parsed_phone.ilike.%${q}%,parsed_email.ilike.%${q}%`)
        .not('job_id', 'is', null)
        .limit(20)

      // 2. Search jobs directly by title → covers manually-created leads
      const { data: jobRows } = await supabase
        .from('jobs')
        .select('id, job_number, title, stage, contact:contacts(full_name)')
        .ilike('title', `%${q}%`)
        .is('deleted_at', null)
        .limit(20)

      const results = new Map<string, LeadSearchResult>()

      for (const row of inboundRows ?? []) {
        if (!row.job_id) continue
        results.set(row.job_id, {
          jobId: row.job_id,
          jobNumber: '',
          title: '',
          stage: '',
          parsedName: row.parsed_name ?? null,
          parsedPhone: row.parsed_phone ?? null,
          contactName: null,
        })
      }

      for (const row of jobRows ?? []) {
        const existing = results.get(row.id)
        const contact = row.contact as { full_name: string } | null
        if (existing) {
          existing.jobNumber = row.job_number
          existing.title = row.title
          existing.stage = row.stage
          existing.contactName = contact?.full_name ?? null
        } else {
          results.set(row.id, {
            jobId: row.id,
            jobNumber: row.job_number,
            title: row.title,
            stage: row.stage,
            parsedName: null,
            parsedPhone: null,
            contactName: contact?.full_name ?? null,
          })
        }
      }

      // Fill in job details for inbound-only hits (those without a title match)
      const missingIds = [...results.values()]
        .filter((r) => !r.jobNumber)
        .map((r) => r.jobId)
      if (missingIds.length) {
        const { data: extraJobs } = await supabase
          .from('jobs')
          .select('id, job_number, title, stage, contact:contacts(full_name)')
          .in('id', missingIds)
          .is('deleted_at', null)
        for (const row of extraJobs ?? []) {
          const existing = results.get(row.id)
          if (existing) {
            existing.jobNumber = row.job_number
            existing.title = row.title
            existing.stage = row.stage
            existing.contactName = (row.contact as { full_name: string } | null)?.full_name ?? null
          }
        }
      }

      return [...results.values()].filter((r) => r.jobNumber)
    },
  })
}

export function useRemapLeadSheet() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (sheetId: string): Promise<{ updated: number }> =>
      (await invokeSync({ action: 'remap', sheetId })) as { updated: number },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['jobs'] })
      void queryClient.invalidateQueries({ queryKey: ['lead-sheets'] })
    },
  })
}
