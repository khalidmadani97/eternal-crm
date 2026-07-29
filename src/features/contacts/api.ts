import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'

export interface ContactOption {
  id: string
  full_name: string
  phone: string | null
  company: { id: string; name: string } | null
}

/** Name search for the job form's contact picker. Auto-created (unverified)
 *  contacts are excluded until a human confirms them. */
export function useContactSearch(term: string) {
  return useQuery({
    queryKey: ['contacts', 'search', term],
    queryFn: async (): Promise<ContactOption[]> => {
      let query = supabase
        .from('contacts')
        .select('id, full_name, phone, company:companies ( id, name )')
        .is('deleted_at', null)
        .eq('auto_created', false)
        .order('full_name')
        .limit(10)
      if (term.trim()) query = query.ilike('full_name', `%${term.trim()}%`)
      const { data, error } = await query
      if (error) throw error
      return data as unknown as ContactOption[]
    },
  })
}

export interface NewContactInput {
  full_name: string
  phone: string | null
  email: string | null
  lead_source: string | null
}

export function useCreateContact() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: NewContactInput) => {
      const { data, error } = await supabase
        .from('contacts')
        .insert(input)
        .select('id, full_name, phone, company:companies ( id, name )')
        .single()
      if (error) throw error
      return data as unknown as ContactOption
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['contacts'] })
    },
  })
}
