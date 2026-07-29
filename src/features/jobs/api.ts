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

// ── Job detail ───────────────────────────────────────────────────────────────

export interface JobDetail {
  id: string
  job_number: string
  title: string
  stage: JobStage
  site_address: string | null
  value_est: number | null
  value_final: number | null
  lead_source: string | null
  lost_reason: string | null
  created_at: string
  contact: { id: string; full_name: string; phone: string | null } | null
  company: { id: string; name: string } | null
  assignee: { id: string; full_name: string | null } | null
}

export function useJob(id: string) {
  return useQuery({
    queryKey: ['jobs', 'detail', id],
    queryFn: async (): Promise<JobDetail> => {
      const { data, error } = await supabase
        .from('jobs')
        .select(
          `id, job_number, title, stage, site_address, value_est, value_final,
           lead_source, lost_reason, created_at,
           contact:contacts ( id, full_name, phone ),
           company:companies ( id, name ),
           assignee:profiles ( id, full_name )`,
        )
        .eq('id', id)
        .single()
      if (error) throw error
      return data as unknown as JobDetail
    },
  })
}

export interface UpdateJobInput {
  id: string
  patch: Partial<{
    title: string
    site_address: string | null
    value_est: number | null
    value_final: number | null
    lead_source: string | null
    assigned_to: string | null
    stage: JobStage
    lost_reason: string
  }>
}

export function useUpdateJob() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: UpdateJobInput) => {
      const { error } = await supabase.from('jobs').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: (_data, { id }) => {
      void queryClient.invalidateQueries({ queryKey: ['jobs'] })
      void queryClient.invalidateQueries({ queryKey: ['activities', id] })
    },
  })
}

// ── Activities ───────────────────────────────────────────────────────────────

export interface Activity {
  id: string
  kind: string
  body: string | null
  meta: Record<string, unknown> | null
  created_at: string
  user: { id: string; full_name: string | null } | null
}

export function useActivities(jobId: string) {
  return useQuery({
    queryKey: ['activities', jobId],
    queryFn: async (): Promise<Activity[]> => {
      const { data, error } = await supabase
        .from('activities')
        .select('id, kind, body, meta, created_at, user:profiles ( id, full_name )')
        .eq('job_id', jobId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as unknown as Activity[]
    },
  })
}

export function useAddNote(jobId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ body, userId }: { body: string; userId: string }) => {
      const { error } = await supabase
        .from('activities')
        .insert({ job_id: jobId, kind: 'note', body, user_id: userId })
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['activities', jobId] })
    },
  })
}

// ── Files ────────────────────────────────────────────────────────────────────

export type FileKind = Database['public']['Enums']['file_kind']

export const FILE_KINDS: FileKind[] = [
  'measure',
  'drawing',
  'slab_photo',
  'site_photo',
  'contract',
  'invoice',
  'other',
]

export interface JobFile {
  id: string
  kind: FileKind
  storage_path: string
  filename: string | null
  size_bytes: number | null
  created_at: string
}

export function useJobFiles(jobId: string) {
  return useQuery({
    queryKey: ['files', jobId],
    queryFn: async (): Promise<JobFile[]> => {
      const { data, error } = await supabase
        .from('files')
        .select('id, kind, storage_path, filename, size_bytes, created_at')
        .eq('job_id', jobId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as JobFile[]
    },
  })
}

export function useUploadFile(jobId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      file,
      kind,
      userId,
    }: {
      file: File
      kind: FileKind
      userId: string
    }) => {
      const path = `jobs/${jobId}/${crypto.randomUUID()}-${file.name}`
      const { error: uploadError } = await supabase.storage
        .from('job-files')
        .upload(path, file)
      if (uploadError) throw uploadError
      const { error } = await supabase.from('files').insert({
        job_id: jobId,
        kind,
        storage_path: path,
        filename: file.name,
        size_bytes: file.size,
        uploaded_by: userId,
      })
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['files', jobId] })
    },
  })
}

export async function fileDownloadUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('job-files')
    .createSignedUrl(path, 300)
  if (error) throw error
  return data.signedUrl
}

export function useDeleteFile(jobId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (fileId: string) => {
      const { data, error } = await supabase.functions.invoke('delete-file', {
        body: { fileId },
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['files', jobId] })
    },
  })
}

// ── Tasks ────────────────────────────────────────────────────────────────────

export interface JobTask {
  id: string
  title: string
  due_date: string | null
  completed_at: string | null
  assignee: { id: string; full_name: string | null } | null
}

export function useJobTasks(jobId: string) {
  return useQuery({
    queryKey: ['tasks', jobId],
    queryFn: async (): Promise<JobTask[]> => {
      const { data, error } = await supabase
        .from('tasks')
        .select('id, title, due_date, completed_at, assignee:profiles ( id, full_name )')
        .eq('job_id', jobId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as unknown as JobTask[]
    },
  })
}

export function useAddTask(jobId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ title, dueDate }: { title: string; dueDate: string | null }) => {
      const { error } = await supabase
        .from('tasks')
        .insert({ job_id: jobId, title, due_date: dueDate })
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tasks', jobId] })
    },
  })
}

export function useToggleTask(jobId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, done }: { id: string; done: boolean }) => {
      const { error } = await supabase
        .from('tasks')
        .update({ completed_at: done ? new Date().toISOString() : null })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tasks', jobId] })
    },
  })
}

// ── Board ────────────────────────────────────────────────────────────────────

/** Stage move with an optimistic cache update and rollback — the board drags
 *  cards; a failed write must visibly snap the card back. */
export function useMoveJobStage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      stage,
      lostReason,
    }: {
      id: string
      stage: JobStage
      lostReason?: string
    }) => {
      const patch: { stage: JobStage; lost_reason?: string } = { stage }
      if (lostReason) patch.lost_reason = lostReason
      const { error } = await supabase.from('jobs').update(patch).eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, stage }) => {
      await queryClient.cancelQueries({ queryKey: ['jobs', 'list'] })
      const previous = queryClient.getQueryData<JobListRow[]>(['jobs', 'list'])
      queryClient.setQueryData<JobListRow[]>(['jobs', 'list'], (old) =>
        old?.map((j) => (j.id === id ? { ...j, stage } : j)),
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(['jobs', 'list'], context.previous)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['jobs'] })
      // The field page reads job.stage through the appointments query.
      void queryClient.invalidateQueries({ queryKey: ['appointments'] })
    },
  })
}
