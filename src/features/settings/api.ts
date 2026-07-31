import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'

// User-editable dropdown lists (Slice 25, DECISIONS 028). Register a list
// here and it becomes manageable in Settings and usable via <OptionSelect>.

export const OPTION_LISTS: { key: string; label: string; description: string }[] = [
  {
    key: 'job_roles',
    label: 'Company roles',
    description: 'Roles assignable to team members — the Daily Brief adapts to them.',
  },
  {
    key: 'lead_sources',
    label: 'Lead sources',
    description: 'Where jobs and contacts come from — feeds win-rate reporting.',
  },
]

export interface OptionItem {
  id: string
  list_key: string
  value: string
  position: number
  active: boolean
}

export function useOptionList(listKey: string, includeInactive = false) {
  return useQuery({
    queryKey: ['options', listKey, includeInactive],
    queryFn: async (): Promise<OptionItem[]> => {
      let query = supabase
        .from('option_items')
        .select('id, list_key, value, position, active')
        .eq('list_key', listKey)
        .order('position')
        .order('value')
      if (!includeInactive) query = query.eq('active', true)
      const { data, error } = await query
      if (error) throw error
      return data as OptionItem[]
    },
    staleTime: 60_000,
  })
}

export function useAddOption() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ listKey, value }: { listKey: string; value: string }) => {
      const { count } = await supabase
        .from('option_items')
        .select('id', { count: 'exact', head: true })
        .eq('list_key', listKey)
      const { error } = await supabase
        .from('option_items')
        .insert({ list_key: listKey, value: value.trim(), position: count ?? 0 })
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['options'] }),
  })
}

export function useUpdateOption() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string
      patch: Partial<{ value: string; position: number; active: boolean }>
    }) => {
      const { error } = await supabase.from('option_items').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['options'] }),
  })
}

export function useDeleteOption() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('option_items').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['options'] }),
  })
}


// ── Team (Slice 29) ──────────────────────────────────────────────────────────

export interface TeamMember {
  id: string
  full_name: string | null
  role: 'admin' | 'staff'
  job_role: string | null
  responsibilities: string | null
}

export function useTeam() {
  return useQuery({
    queryKey: ['team'],
    queryFn: async (): Promise<TeamMember[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, role, job_role, responsibilities')
        .order('full_name')
      if (error) throw error
      return data as TeamMember[]
    },
  })
}

export function useUpdateTeamMember() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string
      patch: Partial<{ full_name: string; job_role: string | null; responsibilities: string | null }>
    }) => {
      const { error } = await supabase.from('profiles').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['team'] })
      void queryClient.invalidateQueries({ queryKey: ['profiles'] })
    },
  })
}

// ── Business settings (Slice 31) ─────────────────────────────────────────────

export interface BusinessSettings {
  name: string
  tagline: string | null
  phone: string | null
  email: string | null
  address: string | null
  hst_number: string | null
  default_tax_rate: number
}

export function useBusinessSettings() {
  return useQuery({
    queryKey: ['business-settings'],
    queryFn: async (): Promise<BusinessSettings> => {
      const { data, error } = await supabase
        .from('business_settings')
        .select('name, tagline, phone, email, address, hst_number, default_tax_rate')
        .eq('id', true)
        .single()
      if (error) throw error
      return data as BusinessSettings
    },
    staleTime: 60_000,
  })
}

export function useUpdateBusinessSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (patch: Partial<BusinessSettings>) => {
      const { error } = await supabase.from('business_settings').update(patch).eq('id', true)
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['business-settings'] }),
  })
}

// ── Integration status (Slice 31) ────────────────────────────────────────────

export interface IntegrationInfo {
  configured: boolean
  needs: string
  what: string
  model?: string
  sendConfigured?: boolean
}

export function useIntegrationStatus() {
  return useQuery({
    queryKey: ['integration-status'],
    queryFn: async (): Promise<Record<string, IntegrationInfo>> => {
      const { data, error } = await supabase.functions.invoke('integration-status', { body: {} })
      if (error) throw error
      return data as Record<string, IntegrationInfo>
    },
    staleTime: 5 * 60_000,
  })
}
