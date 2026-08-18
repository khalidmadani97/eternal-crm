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
  email: string | null
  /** Permission level WITHIN the active business (from business_members). */
  role: 'admin' | 'staff'
  job_role: string | null
  responsibilities: string | null
}

// Active members of the current business. `role` is the per-business
// permission (business_members), not the legacy global profiles.role — so
// changing someone's role here only affects this workspace.
export function useTeam() {
  const { data: membership } = useMyMembership()
  const businessId = membership?.activeBusinessId ?? null
  return useQuery({
    queryKey: ['team', businessId],
    enabled: !!businessId,
    queryFn: async (): Promise<TeamMember[]> => {
      const { data, error } = await supabase
        .from('business_members')
        .select('role, user_id, profiles!inner(id, full_name, email, job_role, responsibilities)')
        .eq('business_id', businessId!)
        .eq('status', 'active')
      if (error) throw error
      type Row = {
        role: 'admin' | 'staff'
        profiles: {
          id: string
          full_name: string | null
          email: string | null
          job_role: string | null
          responsibilities: string | null
        }
      }
      return (data as unknown as Row[])
        .map((m) => ({
          id: m.profiles.id,
          full_name: m.profiles.full_name,
          email: m.profiles.email,
          role: m.role,
          job_role: m.profiles.job_role,
          responsibilities: m.profiles.responsibilities,
        }))
        .sort((a, b) => (a.full_name ?? '').localeCompare(b.full_name ?? ''))
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
  business_id: string
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
        .select('business_id, name, tagline, phone, email, address, hst_number, default_tax_rate')
        .single() // RLS scopes to the active business

      if (error) throw error
      return data as BusinessSettings
    },
    staleTime: 60_000,
  })
}

export function useUpdateBusinessSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (patch: Partial<BusinessSettings> & { business_id: string }) => {
      const { business_id, ...rest } = patch
      const { error } = await supabase
        .from('business_settings')
        .update(rest)
        .eq('business_id', business_id)
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


// ── Multi-tenant (Slice 33) ──────────────────────────────────────────────────

export interface MyMembership {
  activeBusinessId: string | null
  platformAdmin: boolean
  businesses: { id: string; name: string; suspended_at: string | null }[]
  /** The active business exists but is suspended (agency kill-switch). */
  suspended: boolean
}

export function useMyMembership() {
  return useQuery({
    queryKey: ['my-membership'],
    queryFn: async (): Promise<MyMembership> => {
      // Must filter by id: platform admins can SELECT every profile, so an
      // unfiltered .single() throws "multiple rows" and hides the whole menu.
      const { data: sessionData } = await supabase.auth.getSession()
      const uid = sessionData.session?.user.id ?? ''
      const [profileRes, bizRes] = await Promise.all([
        supabase.from('profiles').select('active_business_id, platform_admin').eq('id', uid).single(),
        supabase.from('businesses').select('id, name, suspended_at').order('name'),
      ])
      if (profileRes.error) throw profileRes.error
      if (bizRes.error) throw bizRes.error
      const active = bizRes.data.find((b) => b.id === profileRes.data.active_business_id)
      return {
        activeBusinessId: profileRes.data.active_business_id,
        platformAdmin: profileRes.data.platform_admin,
        businesses: bizRes.data,
        suspended: !profileRes.data.platform_admin && !!active?.suspended_at,
      }
    },
  })
}

export function useRegisterBusiness() {
  return useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase.rpc('register_business', { p_name: name })
      if (error) throw error
      return data
    },
  })
}

export function useAddMember() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ email, role }: { email: string; role: 'admin' | 'staff' }) => {
      const { error } = await supabase.rpc('add_member_by_email', { p_email: email, p_role: role })
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['team'] })
      void queryClient.invalidateQueries({ queryKey: ['profiles'] })
    },
  })
}

export async function switchBusiness(businessId: string) {
  const { error } = await supabase.rpc('set_active_business', { p_business: businessId })
  if (error) throw error
  window.location.assign('/home') // full reload: every cache is tenant-scoped
}


export interface InviteResult {
  added?: boolean
  invited?: boolean
  emailed?: boolean
  link?: string
  business?: string
}

// Every team write goes through the `invite` edge function (service role);
// this unwraps the JSON error body Supabase hides inside `context`.
async function callInvite<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('invite', { body })
  if (error) {
    const context = (error as { context?: Response }).context
    if (context && typeof context.json === 'function') {
      const parsed = await context.json().catch(() => null)
      if (parsed?.error) throw new Error(parsed.error)
    }
    throw error
  }
  return data as T
}

/** Invalidate everything a membership change can touch. */
function useTeamInvalidator() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['team'] })
    void queryClient.invalidateQueries({ queryKey: ['profiles'] })
    void queryClient.invalidateQueries({ queryKey: ['pending-invites'] })
  }
}

export function useInviteMember() {
  const invalidate = useTeamInvalidator()
  return useMutation({
    mutationFn: (input: { email: string; role: 'admin' | 'staff'; businessId?: string }) =>
      callInvite<InviteResult>({ action: 'send', ...input }),
    onSuccess: invalidate,
  })
}

export function useSetMemberRole() {
  const invalidate = useTeamInvalidator()
  return useMutation({
    mutationFn: (input: { userId: string; role: 'admin' | 'staff' }) =>
      callInvite<{ updated: boolean }>({ action: 'set-role', ...input }),
    onSuccess: invalidate,
  })
}

export function useRemoveMember() {
  const invalidate = useTeamInvalidator()
  return useMutation({
    mutationFn: (input: { userId: string }) =>
      callInvite<{ removed: boolean }>({ action: 'remove', ...input }),
    onSuccess: invalidate,
  })
}

export function useRevokeInvite() {
  const invalidate = useTeamInvalidator()
  return useMutation({
    mutationFn: (input: { email: string }) =>
      callInvite<{ revoked: boolean }>({ action: 'revoke', ...input }),
    onSuccess: invalidate,
  })
}

export interface PendingInvite {
  id: string
  email: string
  role: 'admin' | 'staff'
  token: string
  expires_at: string
}

// People invited but not yet signed up, for the active business. RLS already
// scopes invites to businesses the caller administers; we also drop expired.
export function usePendingInvites() {
  const { data: membership } = useMyMembership()
  const businessId = membership?.activeBusinessId ?? null
  return useQuery({
    queryKey: ['pending-invites', businessId],
    enabled: !!businessId,
    queryFn: async (): Promise<PendingInvite[]> => {
      const { data, error } = await supabase
        .from('invites')
        .select('id, email, role, token, expires_at')
        .eq('business_id', businessId!)
        .is('accepted_at', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      const now = Date.now()
      return (data as PendingInvite[]).filter((i) => new Date(i.expires_at).getTime() > now)
    },
  })
}
