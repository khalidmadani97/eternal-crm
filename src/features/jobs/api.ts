import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
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
  id, job_number, title, summary, stage, pipeline_id, close_grade, margin_grade, value_est, value_final, profit_est, profit_final, lead_source, direction, deposit_paid, balance_paid,
  site_address, created_at, updated_at, follow_up,
  contact:contacts ( id, full_name, phone, last_contacted_at, last_contact_method, confirmed ),
  company:companies ( id, name ),
  assignee:profiles ( id, full_name ),
  appointments ( id, kind, starts_at )
` as const

export interface JobListRow {
  id: string
  job_number: string
  title: string
  summary: string | null
  stage: JobStage
  pipeline_id: string | null
  close_grade: number | null
  margin_grade: number | null
  value_est: number | null
  value_final: number | null
  profit_est: number | null
  profit_final: number | null
  lead_source: string | null
  direction: 'north' | 'south' | 'east' | 'west' | null
  deposit_paid: boolean
  balance_paid: boolean
  site_address: string | null
  created_at: string
  updated_at: string
  follow_up: boolean
  contact: {
    id: string
    full_name: string
    phone: string | null
    last_contacted_at: string | null
    last_contact_method: string | null
    confirmed: boolean
  } | null
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
  stage?: JobStage
  pipeline_id?: string | null
  title: string
  summary?: string | null
  site_address: string | null
  value_est: number | null
  profit_est?: number | null
  lead_source: string | null
  direction?: 'north' | 'south' | 'east' | 'west' | null
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
  summary: string | null
  stage: JobStage
  site_address: string | null
  city: string | null
  extra: Record<string, string>
  close_grade: number | null
  margin_grade: number | null
  value_est: number | null
  value_final: number | null
  profit_est: number | null
  profit_final: number | null
  lead_source: string | null
  direction: 'north' | 'south' | 'east' | 'west' | null
  deposit_paid: boolean
  balance_paid: boolean
  follow_up: boolean
  lost_reason: string | null
  created_at: string
  contact: { id: string; full_name: string; phone: string | null; confirmed: boolean } | null
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
          `id, job_number, title, summary, stage, site_address, city, extra, close_grade, margin_grade, value_est, value_final, profit_est, profit_final,
           lead_source, direction, deposit_paid, balance_paid, follow_up, lost_reason, created_at,
           contact:contacts ( id, full_name, phone, confirmed ),
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
    summary: string | null
    site_address: string | null
    city: string | null
    extra: Record<string, string>
    close_grade: number | null
    margin_grade: number | null
    value_est: number | null
    value_final: number | null
    profit_est: number | null
    profit_final: number | null
    lead_source: string | null
    direction: 'north' | 'south' | 'east' | 'west' | null
    assigned_to: string | null
    stage: JobStage
    lost_reason: string
    deposit_paid: boolean
    balance_paid: boolean
  }>
}

/** Returns true for stages that should trigger a conversion event.
 *  Won always qualifies. Visible custom stages (not hidden) also qualify
 *  so a "Completed" pipeline stage fires the same event. */
function isConversionStage(stage: JobStage, queryClient: QueryClient): boolean {
  if (stage === 'won') return true
  if (!stage.startsWith('custom_')) return false
  const settings = queryClient.getQueryData<StageSetting[]>(['stage-settings'])
  return settings?.some((s) => s.stage === stage && !s.hidden) ?? false
}

export function useUpdateJob() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: UpdateJobInput) => {
      const { error } = await supabase.from('jobs').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: (_data, { id, patch }) => {
      void queryClient.invalidateQueries({ queryKey: ['jobs'] })
      void queryClient.invalidateQueries({ queryKey: ['activities', id] })
      if (patch.stage && isConversionStage(patch.stage, queryClient)) {
        void supabase.functions.invoke('process-conversions', { body: {} })
      }
    },
  })
}

export function useToggleFollowUp() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, value }: { id: string; value: boolean }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabase.from('jobs').update({ follow_up: value } as any).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['jobs'] }),
  })
}

export function useConfirmContact() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (contactId: string) => {
      const { error } = await supabase.from('contacts').update({ confirmed: true } as never).eq('id', contactId)
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['jobs'] }),
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

export function useDeleteNote(jobId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (activityId: string) => {
      const { error } = await supabase.from('activities').delete().eq('id', activityId)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['activities'] })
      void queryClient.invalidateQueries({ queryKey: ['activities', jobId] })
    },
  })
}

export function useUpdateNote(jobId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: string }) => {
      const { error } = await supabase.from('activities').update({ body }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['activities', jobId] })
    },
  })
}

export function useAddNote(jobId: string, contactId?: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      body,
      userId,
      audioPath,
    }: {
      body: string
      userId: string
      audioPath?: string | null
    }) => {
      const { error } = await supabase.from('activities').insert({
        job_id: jobId,
        contact_id: contactId ?? null,
        kind: 'note',
        body,
        user_id: userId,
        meta: audioPath ? { audio_path: audioPath } : null,
      })
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
  is_next_step: boolean
  assignee: { id: string; full_name: string | null } | null
}

export function useJobTasks(jobId: string) {
  return useQuery({
    queryKey: ['tasks', jobId],
    queryFn: async (): Promise<JobTask[]> => {
      const { data, error } = await supabase
        .from('tasks')
        .select('id, title, due_date, completed_at, is_next_step, assignee:profiles ( id, full_name )')
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
    mutationFn: async ({
      title,
      dueDate,
      assignedTo,
      isNextStep,
    }: {
      title: string
      dueDate: string | null
      assignedTo?: string | null
      isNextStep?: boolean
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabase.from('tasks').insert({
        job_id: jobId,
        title,
        due_date: dueDate,
        assigned_to: assignedTo ?? null,
        is_next_step: isNextStep ?? false,
      } as any)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tasks', jobId] })
      void queryClient.invalidateQueries({ queryKey: ['tasks', 'all'] })
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

export function useArchivedJobs() {
  return useQuery({
    queryKey: ['jobs', 'archived'],
    queryFn: async (): Promise<JobListRow[]> => {
      const { data, error } = await supabase
        .from('jobs')
        .select(JOB_LIST_SELECT)
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false })
      if (error) throw error
      return data as unknown as JobListRow[]
    },
  })
}

export function useRestoreJob() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('jobs').update({ deleted_at: null }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['jobs'] })
    },
  })
}

/** Bulk soft-delete (delete matrix: jobs are never hard-deleted). */
export function useBulkArchiveJobs() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from('jobs')
        .update({ deleted_at: new Date().toISOString() })
        .in('id', ids)
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['jobs'] }),
  })
}

export function useBulkMoveStage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ ids, stage }: { ids: string[]; stage: JobStage }) => {
      const { error } = await supabase.from('jobs').update({ stage }).in('id', ids)
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['jobs'] }),
  })
}

export function useBulkAssign() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ ids, userId }: { ids: string[]; userId: string | null }) => {
      const { error } = await supabase.from('jobs').update({ assigned_to: userId }).in('id', ids)
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['jobs'] }),
  })
}

export function useBulkToggleFollowUp() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ ids, value }: { ids: string[]; value: boolean }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabase.from('jobs').update({ follow_up: value } as any).in('id', ids)
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['jobs'] }),
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
    onSuccess: (_data, { stage }) => {
      // Fire-and-forget conversion event when a job is won or moves to a
      // visible custom stage (e.g. "Completed"). Queue row written by DB
      // trigger; this processes it immediately. See Settings → Ad tracking.
      if (isConversionStage(stage, queryClient)) {
        void supabase.functions.invoke('process-conversions', { body: {} })
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['jobs'] })
      // The field page reads job.stage through the appointments query.
      void queryClient.invalidateQueries({ queryKey: ['appointments'] })
    },
  })
}

// ── Stage settings (Slice 21) ────────────────────────────────────────────────
// Enum keys are fixed; label, column order, and visibility are customizable.

export interface StageSetting {
  id: string
  stage: JobStage
  label: string
  position: number
  hidden: boolean
  phase: 'pipeline' | 'production'
  pipeline_id: string | null
}

export function useStageSettings() {
  return useQuery({
    queryKey: ['stage-settings'],
    queryFn: async (): Promise<StageSetting[]> => {
      const { data, error } = await supabase
        .from('stage_settings')
        .select('id, stage, label, position, hidden, phase, pipeline_id')
        .order('position')
      if (error) throw error
      return data as StageSetting[]
    },
    staleTime: 60_000,
  })
}

export function useSaveStageSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (settings: StageSetting[]) => {
      for (const s of settings) {
        const { error } = await supabase
          .from('stage_settings')
          .update({ label: s.label, position: s.position, hidden: s.hidden, phase: s.phase })
          .eq('id', s.id)
        if (error) throw error
      }
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['stage-settings'] }),
  })
}

// ── Pipeline / production split (Slice 27, GHL-style) ────────────────────────
// One jobs table, two workspaces. Winning a lead moves it from Pipeline to
// Jobs automatically because membership is just the stage.

export const PIPELINE_STAGES: JobStage[] = ['new', 'contacted', 'quoted', 'follow_up', 'won', 'lost']
export const PRODUCTION_STAGES: JobStage[] = ['won', 'templated', 'fabrication', 'scheduled', 'installed', 'closed']

/** Settings-driven stage list for a workspace. Stage order is fully driven
 *  by the position field in stage_settings — won and lost are no longer
 *  pinned to the end of pipeline so custom stages can appear after them. */
export function useWorkspaceStages(
  phase: 'pipeline' | 'production',
  pipelineId?: string | null,
): JobStage[] {
  const { data: settings } = useStageSettings()
  if (!settings) return phase === 'pipeline' ? PIPELINE_STAGES : PRODUCTION_STAGES

  if (phase === 'pipeline') {
    // Include pipeline-phase stages + won (which lives in production settings
    // but is shared as a pipeline terminal). Sort everything by position.
    const relevant = settings.filter(
      (s) =>
        (s.phase === 'pipeline' || s.stage === 'won') &&
        (!pipelineId || s.pipeline_id === pipelineId || s.stage === 'won'),
    )
    const stages = relevant
      .sort((a, b) => a.position - b.position)
      .map((s) => s.stage as JobStage)
    const unique = [...new Set(stages)]
    if (!unique.includes('won')) unique.push('won')
    if (!unique.includes('lost')) unique.push('lost')
    return unique
  }

  // Production: sort by position, guarantee won is present
  const ordered = settings
    .filter((s) => s.phase === 'production')
    .sort((a, b) => a.position - b.position)
    .map((s) => s.stage as JobStage)
  const unique = [...new Set(ordered)]
  if (!unique.includes('won')) unique.unshift('won')
  return unique
}

// ── Pipelines (Slice 45) ─────────────────────────────────────────────────────

export interface Pipeline {
  id: string
  name: string
  position: number
}

export function usePipelines() {
  return useQuery({
    queryKey: ['pipelines'],
    queryFn: async (): Promise<Pipeline[]> => {
      const { data, error } = await supabase
        .from('pipelines')
        .select('id, name, position')
        .order('position')
      if (error) throw error
      return data as Pipeline[]
    },
    staleTime: 60_000,
  })
}

export function useCreatePipeline() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase.rpc('create_pipeline', { p_name: name })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pipelines'] })
      void queryClient.invalidateQueries({ queryKey: ['stage-settings'] })
    },
  })
}


/** Card tint by close probability: 5 bright green → 1 red. */
export const CLOSE_GRADE_STYLES: Record<number, string> = {
  5: 'border-emerald-500 bg-emerald-100',
  4: 'border-green-400 bg-green-50',
  3: 'border-yellow-400 bg-yellow-50',
  2: 'border-orange-400 bg-orange-50',
  1: 'border-red-400 bg-red-50',
}

export function marginSigns(grade: number | null): string {
  return grade ? '$'.repeat(Math.min(5, Math.max(1, grade))) : ''
}
