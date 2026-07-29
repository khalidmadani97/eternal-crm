import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import type { Database } from '../../types/database'

export type CompanyType = Database['public']['Enums']['company_type']

export const COMPANY_TYPES: CompanyType[] = [
  'builder',
  'designer',
  'general_contractor',
  'supplier',
  'other',
]

export const COMPANY_TYPE_LABELS: Record<CompanyType, string> = {
  builder: 'Builder',
  designer: 'Designer',
  general_contractor: 'General contractor',
  supplier: 'Supplier',
  other: 'Other',
}

export interface CompanyRow {
  id: string
  name: string
  type: CompanyType
  phone: string | null
  email: string | null
  address: string | null
  notes: string | null
}

export function useCompanies() {
  return useQuery({
    queryKey: ['companies', 'list'],
    queryFn: async (): Promise<CompanyRow[]> => {
      const { data, error } = await supabase
        .from('companies')
        .select('id, name, type, phone, email, address, notes')
        .is('deleted_at', null)
        .order('name')
      if (error) throw error
      return data as CompanyRow[]
    },
  })
}

export interface CompanyDetail extends CompanyRow {
  contacts: { id: string; full_name: string; phone: string | null; email: string | null }[]
  jobs: {
    id: string
    job_number: string
    title: string
    stage: string
    value_est: number | null
    value_final: number | null
    created_at: string
  }[]
}

export function useCompany(id: string) {
  return useQuery({
    queryKey: ['companies', 'detail', id],
    queryFn: async (): Promise<CompanyDetail> => {
      const { data, error } = await supabase
        .from('companies')
        .select(
          `id, name, type, phone, email, address, notes,
           contacts ( id, full_name, phone, email, deleted_at ),
           jobs ( id, job_number, title, stage, value_est, value_final, created_at, deleted_at )`,
        )
        .eq('id', id)
        .single()
      if (error) throw error
      type WithDeleted<T> = T & { deleted_at: string | null }
      const raw = data as unknown as Omit<CompanyDetail, 'contacts' | 'jobs'> & {
        contacts: WithDeleted<CompanyDetail['contacts'][number]>[]
        jobs: WithDeleted<CompanyDetail['jobs'][number]>[]
      }
      return {
        ...raw,
        contacts: raw.contacts.filter((c) => c.deleted_at === null),
        jobs: raw.jobs.filter((j) => j.deleted_at === null),
      }
    },
  })
}

/** Total value of every job referred by this company — value_final when the
 *  job has one, value_est otherwise. Matches the SQL coalesce semantics. */
export function referredTotal(jobs: CompanyDetail['jobs']): number {
  return jobs.reduce((sum, j) => sum + (Number(j.value_final ?? j.value_est) || 0), 0)
}

export interface CompanyInput {
  name: string
  type: CompanyType
  phone: string | null
  email: string | null
  address: string | null
  notes: string | null
}

export function useCreateCompany() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: CompanyInput) => {
      const { data, error } = await supabase
        .from('companies')
        .insert(input)
        .select('id')
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['companies'] }),
  })
}

export function useUpdateCompany() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: Partial<CompanyInput> }) => {
      const { error } = await supabase.from('companies').update(input).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['companies'] }),
  })
}

export function useSoftDeleteCompany() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('companies')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['companies'] }),
  })
}
