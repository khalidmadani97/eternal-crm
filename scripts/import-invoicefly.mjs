#!/usr/bin/env node
// One-shot InvoiceFly open-balance import (Slice 12). DELETE AFTER CUTOVER.
//
// Usage:
//   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=… \
//     node scripts/import-invoicefly.mjs path/to/invoicefly-open.csv [--execute]
//
// Expected CSV columns (export open/partially-paid invoices only):
//   Invoice Number, Client Name, Client Phone, Client Email,
//   Issue Date, Due Date, Subtotal, Tax, Total, Paid
//
// Each row becomes: contact (matched by phone, then name), a holding job,
// an issued (immutable) invoice numbered IF-<original>, one line item
// carrying the balance, and a payment row for the already-paid portion so
// the balance matches InvoiceFly to the cent.

import { readFileSync } from 'node:fs'
import { banner, getClient, isDryRun, normalizePhone, parseCsv } from './lib/import-common.mjs'

const file = process.argv[2]
if (!file) {
  console.error('Usage: node scripts/import-invoicefly.mjs <invoicefly.csv> [--execute]')
  process.exit(1)
}

banner('InvoiceFly import')
const rows = parseCsv(readFileSync(file, 'utf8'))
const sb = getClient()

const money = (s) => Math.round(parseFloat(String(s).replace(/[$,]/g, '') || '0') * 100) / 100

let imported = 0
for (const row of rows) {
  const original = (row['Invoice Number'] ?? '').trim()
  const clientName = (row['Client Name'] ?? '').trim()
  if (!original || !clientName) continue
  const subtotal = money(row['Subtotal'])
  const tax = money(row['Tax'])
  const total = money(row['Total'])
  const paid = money(row['Paid'])
  const taxRate = subtotal > 0 ? Math.round((tax / subtotal) * 10000) / 10000 : 0.13
  if (Math.round((subtotal + tax) * 100) !== Math.round(total * 100)) {
    console.log(`WARN ${original}: subtotal+tax != total (${subtotal}+${tax} != ${total}) — importing as stated`)
  }
  const phone = normalizePhone(row['Client Phone'] ?? '')
  const invoiceNumber = `IF-${original}`
  console.log(
    `${invoiceNumber}: ${clientName} — total ${total.toFixed(2)}, paid ${paid.toFixed(2)}, balance ${(total - paid).toFixed(2)}`,
  )
  if (isDryRun) {
    imported++
    continue
  }

  const { data: existing } = await sb
    .from('invoices')
    .select('id')
    .eq('invoice_number', invoiceNumber)
    .maybeSingle()
  if (existing) {
    console.log(`  already imported — skipping`)
    continue
  }

  let contactId = null
  if (phone) {
    const { data } = await sb.from('contacts').select('id').eq('phone', phone).maybeSingle()
    contactId = data?.id ?? null
  }
  if (!contactId) {
    const { data } = await sb
      .from('contacts')
      .select('id')
      .eq('full_name', clientName)
      .is('deleted_at', null)
      .maybeSingle()
    contactId = data?.id ?? null
  }
  if (!contactId) {
    const { data, error } = await sb
      .from('contacts')
      .insert({
        full_name: clientName,
        phone,
        email: (row['Client Email'] ?? '').trim() || null,
        lead_source: 'invoicefly-import',
      })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    contactId = data.id
  }

  const { data: jobNumber, error: nErr } = await sb.rpc('next_document_number', { p_prefix: 'EI' })
  if (nErr) throw new Error(nErr.message)
  const { data: job, error: jErr } = await sb
    .from('jobs')
    .insert({
      contact_id: contactId,
      job_number: jobNumber,
      title: `Imported — InvoiceFly ${original}`,
      stage: 'installed',
      lead_source: 'invoicefly-import',
    })
    .select('id')
    .single()
  if (jErr) throw new Error(jErr.message)

  const { data: invoice, error: iErr } = await sb
    .from('invoices')
    .insert({
      job_id: job.id,
      invoice_number: invoiceNumber,
      status: 'draft',
      issue_date: (row['Issue Date'] ?? '').trim() || null,
      due_date: (row['Due Date'] ?? '').trim() || null,
      subtotal,
      tax_rate: taxRate,
      tax_amount: tax,
      total,
      amount_paid: 0,
    })
    .select('id')
    .single()
  if (iErr) throw new Error(iErr.message)

  const { error: liErr } = await sb.from('invoice_line_items').insert({
    invoice_id: invoice.id,
    position: 0,
    description: `Balance carried from InvoiceFly invoice ${original}`,
    quantity: 1,
    unit: 'ea',
    unit_price: subtotal,
    amount: subtotal,
  })
  if (liErr) throw new Error(liErr.message)

  // Issue it (immutable from here), then record the already-paid portion.
  const { error: sendErr } = await sb
    .from('invoices')
    .update({ status: 'sent', sent_at: new Date().toISOString() })
    .eq('id', invoice.id)
  if (sendErr) throw new Error(sendErr.message)

  if (paid > 0) {
    const { error: payErr } = await sb.from('payments').insert({
      job_id: job.id,
      invoice_id: invoice.id,
      kind: 'progress',
      method: 'other',
      amount: paid,
      received_at: new Date().toISOString().slice(0, 10),
      reference: `invoicefly-import ${original}`,
    })
    if (payErr) throw new Error(payErr.message)
  }
  imported++
}

console.log(`\n${isDryRun ? 'Would import' : 'Imported'} ${imported} invoices.`)
console.log('\nCutover process (ROADMAP Slice 12): run InvoiceFly in PARALLEL for one')
console.log('full month — issue in both, reconcile weekly with the CSV export from')
console.log('/invoices. Cut over only after a month with zero discrepancies.')
