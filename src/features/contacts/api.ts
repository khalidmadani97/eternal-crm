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

// ── Contacts list / detail (Slice 5) ─────────────────────────────────────────

export interface ContactRow {
  id: string
  full_name: string
  phone: string | null
  email: string | null
  address: string | null
  city: string | null
  extra: Record<string, string>
  lead_source: string | null
  auto_created: boolean
  notes: string | null
  last_contacted_at: string | null
  last_contact_method: string | null
  last_contact_detail: string | null
  company: { id: string; name: string } | null
}

export function useContacts(includeAutoCreated: boolean) {
  return useQuery({
    queryKey: ['contacts', 'list', includeAutoCreated],
    queryFn: async (): Promise<ContactRow[]> => {
      let query = supabase
        .from('contacts')
        .select(
          'id, full_name, phone, email, address, city, extra, lead_source, auto_created, notes, last_contacted_at, last_contact_method, last_contact_detail, company:companies ( id, name )',
        )
        .is('deleted_at', null)
        .order('full_name')
      if (!includeAutoCreated) query = query.eq('auto_created', false)
      const { data, error } = await query
      if (error) throw error
      return data as unknown as ContactRow[]
    },
  })
}

export interface ContactDetail extends ContactRow {
  jobs: {
    id: string
    job_number: string
    title: string
    stage: string
    value_est: number | null
    value_final: number | null
    created_at: string
    deleted_at: string | null
  }[]
}

export function useContact(id: string) {
  return useQuery({
    queryKey: ['contacts', 'detail', id],
    queryFn: async (): Promise<ContactDetail> => {
      const { data, error } = await supabase
        .from('contacts')
        .select(
          `id, full_name, phone, email, address, city, extra, lead_source, auto_created, notes,
           last_contacted_at, last_contact_method, last_contact_detail,
           company:companies ( id, name ),
           jobs ( id, job_number, title, stage, value_est, value_final, created_at, deleted_at )`,
        )
        .eq('id', id)
        .single()
      if (error) throw error
      const detail = data as unknown as ContactDetail
      detail.jobs = detail.jobs.filter((j) => j.deleted_at === null)
      return detail
    },
  })
}

export interface ContactInput {
  full_name: string
  phone: string | null
  email: string | null
  address: string | null
  city: string | null
  extra: Record<string, string>
  lead_source: string | null
  company_id: string | null
  notes: string | null
  auto_created?: boolean
}

export function useUpdateContact() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: Partial<ContactInput> }) => {
      const { error } = await supabase.from('contacts').update(input).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['contacts'] }),
  })
}

export function useCreateFullContact() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: ContactInput) => {
      const { data, error } = await supabase.from('contacts').insert(input).select('id').single()
      if (error) throw error
      return data
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['contacts'] }),
  })
}

export function useSoftDeleteContact() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('contacts')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['contacts'] }),
  })
}

// ── Contact activity timeline (Slice 17) ─────────────────────────────────────
// Contact-level events: notes, comms, DMs. job_id may or may not be set.

export interface ContactActivity {
  id: string
  kind: string
  body: string | null
  meta: Record<string, unknown> | null
  created_at: string
  user: { id: string; full_name: string | null } | null
  job: { id: string; job_number: string } | null
}

export function useContactActivities(contactId: string) {
  return useQuery({
    queryKey: ['activities', 'contact', contactId],
    queryFn: async (): Promise<ContactActivity[]> => {
      const { data, error } = await supabase
        .from('activities')
        .select(
          'id, kind, body, meta, created_at, user:profiles ( id, full_name ), job:jobs ( id, job_number )',
        )
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return data as unknown as ContactActivity[]
    },
  })
}

export function useAddContactNote(contactId: string) {
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
        contact_id: contactId,
        kind: 'note',
        body,
        user_id: userId,
        meta: audioPath ? { audio_path: audioPath } : null,
      })
      if (error) throw error
    },
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['activities', 'contact', contactId] }),
  })
}

// ── Last contacted (Slice 24) ────────────────────────────────────────────────

export type ContactMethod =
  | 'call'
  | 'sms'
  | 'email'
  | 'messenger'
  | 'instagram'
  | 'in_person'
  | 'other'

export const CONTACT_METHOD_LABELS: Record<ContactMethod, string> = {
  call: 'Phone call',
  sms: 'Text message',
  email: 'Email',
  messenger: 'Meta Business Suite (Messenger)',
  instagram: 'Instagram DM',
  in_person: 'In person',
  other: 'Other',
}

export function useLogContact() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      contactId: string
      method: ContactMethod
      detail: string | null
      at: string
      by: string | null
      note: string | null
    }) => {
      const { error } = await supabase.rpc('log_contact', {
        p_contact_id: input.contactId,
        p_method: input.method,
        p_detail: input.detail ?? undefined,
        p_at: input.at,
        p_by: input.by ?? undefined,
        p_note: input.note ?? undefined,
      })
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['contacts'] })
      void queryClient.invalidateQueries({ queryKey: ['activities'] })
      void queryClient.invalidateQueries({ queryKey: ['jobs'] })
    },
  })
}
