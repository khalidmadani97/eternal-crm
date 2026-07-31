import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { formatCurrency } from '../../lib/format'
import type { Database } from '../../types/database'
import { renderContractBody, TEMPLATE_VERSION } from './template'

export type ContractStatus = Database['public']['Enums']['contract_status']

export interface Contract {
  id: string
  job_id: string
  template_version: string
  body_snapshot: string
  status: ContractStatus
  sign_token: string | null
  token_expires_at: string | null
  sent_at: string | null
  signed_at: string | null
  signer_name: string | null
  signer_email: string | null
  signed_pdf_path: string | null
  created_at: string
}

export function useJobContracts(jobId: string) {
  return useQuery({
    queryKey: ['contracts', 'job', jobId],
    queryFn: async (): Promise<Contract[]> => {
      const { data, error } = await supabase
        .from('contracts')
        .select(
          `id, job_id, template_version, body_snapshot, status, sign_token,
           token_expires_at, sent_at, signed_at, signer_name, signer_email,
           signed_pdf_path, created_at`,
        )
        .eq('job_id', jobId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Contract[]
    },
  })
}

interface GenerateInput {
  jobId: string
  contactName: string
  siteAddress: string | null
  jobTitle: string
  jobNumber: string
  total: number | null
}

export function useGenerateContract() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: GenerateInput) => {
      const body = renderContractBody({
        contactName: input.contactName,
        siteAddress: input.siteAddress ?? '(site address to be confirmed)',
        jobTitle: input.jobTitle,
        jobNumber: input.jobNumber,
        totalText: input.total ? formatCurrency(input.total) : '(as per accepted quote)',
      })
      const { data, error } = await supabase
        .from('contracts')
        .insert({
          job_id: input.jobId,
          template_version: TEMPLATE_VERSION,
          body_snapshot: body,
        })
        .select('id')
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['contracts'] }),
  })
}

/** Send: mint the single-use token and freeze what was sent. The body was
 *  merged at generation; sending stamps sent_at, token, and expiry in the
 *  same draft→sent update (the immutability trigger freezes it after). */
export function useSendContract() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (contract: Contract) => {
      const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
      const expires = new Date(Date.now() + 14 * 24 * 3600_000).toISOString()
      const { error } = await supabase
        .from('contracts')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          sign_token: token,
          token_expires_at: expires,
        })
        .eq('id', contract.id)
        .eq('status', 'draft')
      if (error) throw error
      return token
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['contracts'] }),
  })
}

export function useVoidContract() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('contracts').update({ status: 'void' }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['contracts'] }),
  })
}

export function signingUrl(token: string): string {
  return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sign-contract?token=${token}`
}

export async function signedPdfUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('job-files').createSignedUrl(path, 300)
  if (error) throw error
  return data.signedUrl
}

/** Every contract, newest first — the /contracts list (Slice 26). */
export function useAllContracts() {
  return useQuery({
    queryKey: ['contracts', 'all'],
    queryFn: async (): Promise<(Contract & { job: { id: string; job_number: string; title: string; contact: { full_name: string } | null } | null })[]> => {
      const { data, error } = await supabase
        .from('contracts')
        .select(
          `id, job_id, template_version, body_snapshot, status, sign_token,
           token_expires_at, sent_at, signed_at, signer_name, signer_email,
           signed_pdf_path, created_at,
           job:jobs ( id, job_number, title, contact:contacts ( full_name ) )`,
        )
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as never
    },
  })
}
