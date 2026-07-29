import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'

export interface Profile {
  id: string
  full_name: string | null
  role: 'admin' | 'staff'
}

export function useProfiles() {
  return useQuery({
    queryKey: ['profiles'],
    queryFn: async (): Promise<Profile[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .order('full_name')
      if (error) throw error
      return data
    },
  })
}
