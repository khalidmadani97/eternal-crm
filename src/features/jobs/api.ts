import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import type { Database } from '../../types/database'

export type JobStage = Database['public']['Enums']['job_stage']

export const JOB_STAGES: JobStage[] = [
  'new',
  'contacted',
  'quoted',
  'follow_up',
  'won',
  'templated',
  'fabrication',
  'scheduled',
  'installed',
  'closed',
  'lost',
]

const JOB_LIST_SELECT = `
  id, job_number, title, stage, value_est, value_final, lead_source,
  site_address, created_at,
  contact:contacts ( id, full_name ),
  company:companies ( id, name ),
  assignee:profiles ( id, full_name ),
  appointments ( id, kind, starts_at )
` as const

export interface JobListRow {
  id: string
  job_number: string
  title: string
  stage: JobStage
  value_est: number | null
  value_final: number | null
  lead_source: string | null
  site_address: string | null
  created_at: string
  contact: { id: string; full_name: string } | null
  company: { id: string; name: string } | null
  assignee: { id: string; full_name: string | null } | null
  appointments: { id: string; kind: string; starts_at: string }[]
}

/** Earliest install appointment, or null — the list's "install date" column. */
export function installDate(job: JobListRow): string | null {
  const installs = job.appointments
    .filter((a) => a.kind === 'install')
    .map((a) => a.starts_at)
    .sort()
  return installs[0] ?? null
}

export function useJobs() {
  return useQuery({
    queryKey: ['jobs', 'list'],
    queryFn: async (): Promise<JobListRow[]> => {
      const { data, error } = await supabase
        .from('jobs')
        .select(JOB_LIST_SELECT)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as unknown as JobListRow[]
    },
  })
}

export interface NewJobInput {
  contact_id: string
  title: string
  site_address: string | null
  value_est: number | null
  lead_source: string | null
}

export function useCreateJob() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: NewJobInput) => {
      const { data: jobNumber, error: numberError } = await supabase.rpc(
        'next_document_number',
        { p_prefix: 'EI' },
      )
      if (numberError) throw numberError
      const { data, error } = await supabase
        .from('jobs')
        .insert({ ...input, job_number: jobNumber })
        .select('id, job_number')
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['jobs'] })
    },
  })
}
