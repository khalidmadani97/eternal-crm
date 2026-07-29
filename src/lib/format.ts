// The single home for display formatting (CLAUDE.md). Currency, dates, and
// phone numbers are formatted here and nowhere else.

const currency = new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
})

export function formatCurrency(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—'
  const n = typeof value === 'string' ? Number(value) : value
  if (Number.isNaN(n)) return '—'
  return currency.format(n)
}

const dateFmt = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
})

const dateTimeFmt = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return '—'
  return dateFmt.format(d)
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return '—'
  return dateTimeFmt.format(d)
}

/** Display an E.164 number as (416) 555-1234. Non-NANP numbers pass through. */
export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return '—'
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164)
  if (!m) return e164
  return `(${m[1]}) ${m[2]}-${m[3]}`
}

/**
 * Normalise user input to E.164 for storage. Assumes Canada (+1) for bare
 * 10-digit numbers. Returns null when the input cannot be a valid number —
 * callers must treat null as a validation failure, never store the raw input.
 */
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  const digits = trimmed.replace(/[^\d+]/g, '')
  if (/^\+[1-9]\d{7,14}$/.test(digits)) return digits
  const bare = digits.replace(/\D/g, '')
  if (bare.length === 10) return `+1${bare}`
  if (bare.length === 11 && bare.startsWith('1')) return `+${bare}`
  return null
}
