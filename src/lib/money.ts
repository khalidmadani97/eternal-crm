// Document money math — used by quotes and invoices. All arithmetic in
// integer cents; amounts round half-up per line, tax rounds once on the
// subtotal. Results are plain numbers with two decimals, safe to send to
// numeric(12,2) columns.

export interface LineItemInput {
  quantity: number
  unit_price: number
}

function toCents(n: number): number {
  return Math.round(n * 100)
}

function fromCents(c: number): number {
  return c / 100
}

/** quantity × unit price, rounded to the cent. */
export function lineAmount(item: LineItemInput): number {
  return fromCents(Math.round(item.quantity * toCents(item.unit_price)))
}

export interface DocumentTotals {
  subtotal: number
  tax_amount: number
  total: number
}

export function documentTotals(items: LineItemInput[], taxRate: number): DocumentTotals {
  const subtotalCents = items.reduce((sum, item) => sum + toCents(lineAmount(item)), 0)
  const taxCents = Math.round(subtotalCents * taxRate)
  return {
    subtotal: fromCents(subtotalCents),
    tax_amount: fromCents(taxCents),
    total: fromCents(subtotalCents + taxCents),
  }
}
