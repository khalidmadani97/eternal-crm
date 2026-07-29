import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { DEFAULT_TAX_RATE } from '../../lib/business'
import { documentTotals, lineAmount } from '../../lib/money'
import type { Database, Json } from '../../types/database'

export type QuoteStatus = Database['public']['Enums']['quote_status']

export interface QuoteLineItem {
  id?: string
  position: number
  description: string
  quantity: number
  unit: string | null
  unit_price: number
}

export interface Quote {
  id: string
  job_id: string
  quote_number: string
  status: QuoteStatus
  subtotal: number
  tax_rate: number
  tax_amount: number
  total: number
  valid_until: string | null
  sent_at: string | null
  accepted_at: string | null
  body_snapshot: QuoteSnapshot | null
  created_at: string
  line_items: (QuoteLineItem & { id: string })[]
  job: {
    id: string
    job_number: string
    title: string
    site_address: string | null
    stage: string
    contact: { id: string; full_name: string; email: string | null; phone: string | null } | null
  } | null
}

/** Exactly what was sent, frozen at send time. */
export interface QuoteSnapshot {
  quote_number: string
  sent_at: string
  valid_until: string | null
  line_items: { description: string; quantity: number; unit: string | null; unit_price: number; amount: number }[]
  subtotal: number
  tax_rate: number
  tax_amount: number
  total: number
}

const QUOTE_SELECT = `
  id, job_id, quote_number, status, subtotal, tax_rate, tax_amount, total,
  valid_until, sent_at, accepted_at, body_snapshot, created_at,
  line_items:quote_line_items ( id, position, description, quantity, unit, unit_price ),
  job:jobs ( id, job_number, title, site_address, stage,
             contact:contacts ( id, full_name, email, phone ) )
` as const

function sortItems(q: Quote): Quote {
  q.line_items.sort((a, b) => a.position - b.position)
  return q
}

export function useJobQuotes(jobId: string) {
  return useQuery({
    queryKey: ['quotes', 'job', jobId],
    queryFn: async (): Promise<Quote[]> => {
      const { data, error } = await supabase
        .from('quotes')
        .select(QUOTE_SELECT)
        .eq('job_id', jobId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data as unknown as Quote[]).map(sortItems)
    },
  })
}

export function useQuote(id: string) {
  return useQuery({
    queryKey: ['quotes', 'detail', id],
    queryFn: async (): Promise<Quote> => {
      const { data, error } = await supabase
        .from('quotes')
        .select(QUOTE_SELECT)
        .eq('id', id)
        .single()
      if (error) throw error
      return sortItems(data as unknown as Quote)
    },
  })
}

export function useCreateQuote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (jobId: string) => {
      const { data: quoteNumber, error: numberError } = await supabase.rpc(
        'next_document_number',
        { p_prefix: 'Q' },
      )
      if (numberError) throw numberError
      const { data, error } = await supabase
        .from('quotes')
        .insert({
          job_id: jobId,
          quote_number: quoteNumber,
          tax_rate: DEFAULT_TAX_RATE,
          subtotal: 0,
          tax_amount: 0,
          total: 0,
        })
        .select('id')
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['quotes'] }),
  })
}

/** Draft-only: replace the line items wholesale and store recomputed totals.
 *  The DB guard rejects line-item deletes once the quote leaves draft. */
export function useSaveQuoteLines() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      quote,
      items,
      validUntil,
    }: {
      quote: Quote
      items: QuoteLineItem[]
      validUntil: string | null
    }) => {
      const { error: deleteError } = await supabase
        .from('quote_line_items')
        .delete()
        .eq('quote_id', quote.id)
      if (deleteError) throw deleteError
      if (items.length > 0) {
        const { error: insertError } = await supabase.from('quote_line_items').insert(
          items.map((item, i) => ({
            quote_id: quote.id,
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
      const totals = documentTotals(items, quote.tax_rate)
      const { error: updateError } = await supabase
        .from('quotes')
        .update({ ...totals, valid_until: validUntil })
        .eq('id', quote.id)
      if (updateError) throw updateError
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['quotes'] }),
  })
}

export function useSendQuote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (quote: Quote) => {
      const sentAt = new Date().toISOString()
      const snapshot: QuoteSnapshot = {
        quote_number: quote.quote_number,
        sent_at: sentAt,
        valid_until: quote.valid_until,
        line_items: quote.line_items.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          unit_price: item.unit_price,
          amount: lineAmount(item),
        })),
        subtotal: quote.subtotal,
        tax_rate: quote.tax_rate,
        tax_amount: quote.tax_amount,
        total: quote.total,
      }
      const { error } = await supabase
        .from('quotes')
        .update({ status: 'sent', sent_at: sentAt, body_snapshot: snapshot as unknown as Json })
        .eq('id', quote.id)
        .eq('status', 'draft')
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['quotes'] }),
  })
}

export function useSetQuoteStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: QuoteStatus }) => {
      const patch: { status: QuoteStatus; accepted_at?: string } = { status }
      if (status === 'accepted') patch.accepted_at = new Date().toISOString()
      const { error } = await supabase.from('quotes').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['quotes'] }),
  })
}
