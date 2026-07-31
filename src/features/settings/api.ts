import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'

// User-editable dropdown lists (Slice 25, DECISIONS 028). Register a list
// here and it becomes manageable in Settings and usable via <OptionSelect>.

export const OPTION_LISTS: { key: string; label: string; description: string }[] = [
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
