import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { documentTotals, lineAmount } from '../../lib/money'
import type { Database } from '../../types/database'

export type InvoiceStatus = Database['public']['Enums']['invoice_status']
export type PaymentKind = Database['public']['Enums']['payment_kind']
export type PaymentMethod = Database['public']['Enums']['payment_method']

export const PAYMENT_KINDS: PaymentKind[] = ['deposit', 'progress', 'final', 'refund']
export const PAYMENT_METHODS: PaymentMethod[] = ['etransfer', 'cheque', 'cash', 'card', 'other']

export interface InvoiceLineItem {
  id?: string
  position: number
  description: string
  quantity: number
  unit: string | null
  unit_price: number
}

export interface Payment {
  id: string
  kind: PaymentKind
  method: PaymentMethod
  amount: number
  received_at: string
  reference: string | null
}

export interface Invoice {
  id: string
  job_id: string
  quote_id: string | null
  invoice_number: string
  status: InvoiceStatus
  issue_date: string | null
  due_date: string | null
  subtotal: number
  tax_rate: number
  tax_amount: number
  total: number
  amount_paid: number
  stripe_payment_link: string | null
  sent_at: string | null
  paid_at: string | null
  voided_at: string | null
  created_at: string
  line_items: (InvoiceLineItem & { id: string })[]
  payments: Payment[]
  job: {
    id: string
    job_number: string
    title: string
    site_address: string | null
    contact: { id: string; full_name: string; email: string | null; phone: string | null } | null
  } | null
}

const INVOICE_SELECT = `
  id, job_id, quote_id, invoice_number, status, issue_date, due_date,
  subtotal, tax_rate, tax_amount, total, amount_paid, stripe_payment_link,
  sent_at, paid_at, voided_at, created_at,
  line_items:invoice_line_items ( id, position, description, quantity, unit, unit_price ),
  payments ( id, kind, method, amount, received_at, reference ),
  job:jobs ( id, job_number, title, site_address,
             contact:contacts ( id, full_name, email, phone ) )
` as const

function sortInvoice(inv: Invoice): Invoice {
  inv.line_items.sort((a, b) => a.position - b.position)
  inv.payments.sort((a, b) => a.received_at.localeCompare(b.received_at))
  return inv
}

export function useInvoices() {
  return useQuery({
    queryKey: ['invoices', 'list'],
    queryFn: async (): Promise<Invoice[]> => {
      const { data, error } = await supabase
        .from('invoices')
        .select(INVOICE_SELECT)
        .order('invoice_number', { ascending: false })
      if (error) throw error
      return (data as unknown as Invoice[]).map(sortInvoice)
    },
  })
}

export function useInvoice(id: string) {
  return useQuery({
    queryKey: ['invoices', 'detail', id],
    queryFn: async (): Promise<Invoice> => {
      const { data, error } = await supabase
        .from('invoices')
        .select(INVOICE_SELECT)
        .eq('id', id)
        .single()
      if (error) throw error
      return sortInvoice(data as unknown as Invoice)
    },
  })
}

/** Atomic server-side creation — the number is minted inside the same
 *  transaction as the insert, so invoice numbers stay gapless. */
export function useCreateInvoice() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (jobId: string) => {
      const { data, error } = await supabase.rpc('create_invoice', { p_job_id: jobId })
      if (error) throw error
      return data
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['invoices'] }),
  })
}

export function useConvertQuote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (quoteId: string) => {
      const { data, error } = await supabase.rpc('convert_quote_to_invoice', {
        p_quote_id: quoteId,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['invoices'] })
      void queryClient.invalidateQueries({ queryKey: ['quotes'] })
    },
  })
}

export function useSaveInvoiceLines() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      invoice,
      items,
      dueDate,
    }: {
      invoice: Invoice
      items: InvoiceLineItem[]
      dueDate: string | null
    }) => {
      const { error: deleteError } = await supabase
        .from('invoice_line_items')
        .delete()
        .eq('invoice_id', invoice.id)
      if (deleteError) throw deleteError
      if (items.length > 0) {
        const { error: insertError } = await supabase.from('invoice_line_items').insert(
          items.map((item, i) => ({
            invoice_id: invoice.id,
            position: i,
            description: item.description,
            quantity: item.quantity,
            unit: item.unit,
            unit_price: item.unit_price,
            amount: lineAmount(item),
          })),
        )
        if (insertError) throw insertError
      }
      const totals = documentTotals(items, invoice.tax_rate)
      const { error: updateError } = await supabase
        .from('invoices')
        .update({ ...totals, due_date: dueDate })
        .eq('id', invoice.id)
      if (updateError) throw updateError
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['invoices'] }),
  })
}

export function useSendInvoice() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (invoice: Invoice) => {
      const { error } = await supabase
        .from('invoices')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          issue_date: new Date().toISOString().slice(0, 10),
        })
        .eq('id', invoice.id)
        .eq('status', 'draft')
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['invoices'] }),
  })
}

export interface NewPaymentInput {
  invoice: Invoice
  kind: PaymentKind
  method: PaymentMethod
  amount: number
  receivedAt: string
  reference: string | null
}

export function useRecordPayment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ invoice, kind, method, amount, receivedAt, reference }: NewPaymentInput) => {
      const { error } = await supabase.from('payments').insert({
        job_id: invoice.job_id,
        invoice_id: invoice.id,
        kind,
        method,
        // Refunds are stored negative so amount_paid stays a plain sum.
        amount: kind === 'refund' ? -Math.abs(amount) : amount,
        received_at: receivedAt,
        reference,
      })
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['invoices'] }),
  })
}

export function useVoidInvoice() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await supabase.rpc('void_invoice', {
        p_invoice_id: id,
        p_reason: reason,
      })
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['invoices'] }),
  })
}

export function useCreatePaymentLink() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (invoiceId: string) => {
      const { data, error } = await supabase.functions.invoke('create-payment-link', {
        body: { invoiceId },
      })
      if (error) throw error
      return data as { url: string }
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['invoices'] }),
  })
}

/** Bookkeeper CSV — one row per invoice with paid/balance. */
export function invoicesToCsv(invoices: Invoice[]): string {
  const header = [
    'invoice_number', 'status', 'job_number', 'contact', 'issue_date',
    'due_date', 'subtotal', 'tax_rate', 'tax_amount', 'total', 'amount_paid',
    'balance', 'paid_at', 'voided_at',
  ]
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const rows = invoices.map((inv) =>
    [
      inv.invoice_number, inv.status, inv.job?.job_number ?? '',
      inv.job?.contact?.full_name ?? '', inv.issue_date ?? '', inv.due_date ?? '',
      inv.subtotal, inv.tax_rate, inv.tax_amount, inv.total, inv.amount_paid,
      (Number(inv.total) - Number(inv.amount_paid)).toFixed(2),
      inv.paid_at ?? '', inv.voided_at ?? '',
    ]
      .map(escape)
      .join(','),
  )
  return [header.join(','), ...rows].join('\n')
}
