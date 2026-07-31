import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import type { Database } from '../../types/database'

export type ExpenseCategory = Database['public']['Enums']['expense_category']
export type PaymentMethod = Database['public']['Enums']['payment_method']

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'materials', 'subcontractor', 'labour', 'equipment', 'disposal',
  'permits', 'fuel', 'marketing', 'office', 'rent', 'insurance',
  'software', 'other',
]

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  materials: 'Materials',
  subcontractor: 'Subcontractor',
  labour: 'Labour',
  equipment: 'Equipment',
  disposal: 'Disposal',
  permits: 'Permits',
  fuel: 'Fuel',
  marketing: 'Marketing',
  office: 'Office',
  rent: 'Rent',
  insurance: 'Insurance',
  software: 'Software',
  other: 'Other',
}

/** Categories that make sense attached to a job — the rest are overhead. */
export const JOB_COST_CATEGORIES: ExpenseCategory[] = [
  'materials', 'subcontractor', 'labour', 'equipment', 'disposal', 'permits', 'other',
]

export interface Expense {
  id: string
  job_id: string | null
  category: ExpenseCategory
  vendor: string | null
  description: string | null
  amount: number
  hst_amount: number
  method: PaymentMethod | null
  incurred_at: string
  reference: string | null
  receipt_path: string | null
  job: { id: string; job_number: string; title: string } | null
}

const EXPENSE_SELECT = `
  id, job_id, category, vendor, description, amount, hst_amount, method,
  incurred_at, reference, receipt_path,
  job:jobs ( id, job_number, title )
` as const

export function useJobExpenses(jobId: string) {
  return useQuery({
    queryKey: ['expenses', 'job', jobId],
    queryFn: async (): Promise<Expense[]> => {
      const { data, error } = await supabase
        .from('expenses')
        .select(EXPENSE_SELECT)
        .eq('job_id', jobId)
        .order('incurred_at', { ascending: false })
      if (error) throw error
      return data as unknown as Expense[]
    },
  })
}

export function useAllExpenses() {
  return useQuery({
    queryKey: ['expenses', 'all'],
    queryFn: async (): Promise<Expense[]> => {
      const { data, error } = await supabase
        .from('expenses')
        .select(EXPENSE_SELECT)
        .order('incurred_at', { ascending: false })
      if (error) throw error
      return data as unknown as Expense[]
    },
  })
}

export interface NewExpenseInput {
  job_id: string | null
  category: ExpenseCategory
  vendor: string | null
  description: string | null
  amount: number
  hst_amount: number
  method: PaymentMethod | null
  incurred_at: string
  reference: string | null
  receipt?: File | null
  created_by: string
}

export function useCreateExpense() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ receipt, ...input }: NewExpenseInput) => {
      let receipt_path: string | null = null
      if (receipt) {
        receipt_path = `expenses/${crypto.randomUUID()}-${receipt.name}`
        const { error: uploadError } = await supabase.storage
          .from('job-files')
          .upload(receipt_path, receipt)
        if (uploadError) throw uploadError
      }
      const { error } = await supabase.from('expenses').insert({ ...input, receipt_path })
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['expenses'] }),
  })
}

export function useDeleteExpense() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('expenses').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['expenses'] }),
  })
}

export async function receiptUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('job-files').createSignedUrl(path, 300)
  if (error) throw error
  return data.signedUrl
}

/** Pre-tax revenue actually invoiced on a job (issued, non-void invoices).
 *  P&L and profitability exclude HST throughout — it is remitted, not earned. */
export function useJobInvoicedRevenue(jobId: string) {
  return useQuery({
    queryKey: ['expenses', 'revenue', jobId],
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase
        .from('invoices')
        .select('subtotal, status')
        .eq('job_id', jobId)
        .not('status', 'in', '("draft","void")')
      if (error) throw error
      return data.reduce((sum, inv) => sum + (Number(inv.subtotal) || 0), 0)
    },
  })
}
