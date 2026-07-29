import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import type { Database } from '../../types/database'

export type ApptKind = Database['public']['Enums']['appt_kind']

export const APPT_KINDS: ApptKind[] = ['consultation', 'template', 'install', 'service', 'pickup']

export const APPT_KIND_LABELS: Record<ApptKind, string> = {
  consultation: 'Consultation',
  template: 'Template',
  install: 'Install',
  service: 'Service',
  pickup: 'Pickup',
}

/** Calendar block colour per kind — bg + text. */
export const APPT_KIND_STYLES: Record<ApptKind, string> = {
  consultation: 'bg-blue-100 text-blue-900 border-blue-300',
  template: 'bg-purple-100 text-purple-900 border-purple-300',
  install: 'bg-orange-100 text-orange-900 border-orange-300',
  service: 'bg-teal-100 text-teal-900 border-teal-300',
  pickup: 'bg-stone-200 text-stone-800 border-stone-300',
}

export interface AppointmentRow {
  id: string
  kind: ApptKind
  starts_at: string
  ends_at: string | null
  notes: string | null
  assignee: { id: string; full_name: string | null } | null
  job: {
    id: string
    job_number: string
    title: string
    site_address: string | null
    stage: string
    contact: { id: string; full_name: string; phone: string | null } | null
  } | null
}

const APPT_SELECT = `
  id, kind, starts_at, ends_at, notes,
  assignee:profiles ( id, full_name ),
  job:jobs ( id, job_number, title, site_address, stage,
             contact:contacts ( id, full_name, phone ) )
` as const

/** Appointments within [from, to) — the visible calendar range. */
export function useAppointments(fromIso: string, toIso: string) {
  return useQuery({
    queryKey: ['appointments', 'range', fromIso, toIso],
    queryFn: async (): Promise<AppointmentRow[]> => {
      const { data, error } = await supabase
        .from('appointments')
        .select(APPT_SELECT)
        .gte('starts_at', fromIso)
        .lt('starts_at', toIso)
        .order('starts_at')
      if (error) throw error
      return data as unknown as AppointmentRow[]
    },
  })
}

export function useJobAppointments(jobId: string) {
  return useQuery({
    queryKey: ['appointments', 'job', jobId],
    queryFn: async (): Promise<AppointmentRow[]> => {
      const { data, error } = await supabase
        .from('appointments')
        .select(APPT_SELECT)
        .eq('job_id', jobId)
        .order('starts_at')
      if (error) throw error
      return data as unknown as AppointmentRow[]
    },
  })
}

export interface NewAppointmentInput {
  job_id: string
  kind: ApptKind
  starts_at: string
  ends_at: string | null
  assigned_to: string | null
  notes: string | null
}

export function useCreateAppointment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: NewAppointmentInput) => {
      const { error } = await supabase.from('appointments').insert(input)
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['appointments'] }),
  })
}

/** Drag-to-reschedule: shift starts_at (and ends_at by the same delta). */
export function useRescheduleAppointment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      startsAt,
      endsAt,
    }: {
      id: string
      startsAt: string
      endsAt: string | null
    }) => {
      const { error } = await supabase
        .from('appointments')
        .update({ starts_at: startsAt, ends_at: endsAt })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['appointments'] }),
  })
}
