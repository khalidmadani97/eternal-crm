// Business identity rendered on quotes, invoices, and contracts.
// TODO(owner): replace the placeholder HST number and contact details with
// the real registered values before the first document goes to a client.

export const BUSINESS = {
  name: 'Eternal Interiors',
  tagline: 'Custom stone & millwork',
  phone: '+14165550000',
  email: 'hello@eternalinteriors.ca',
  address: 'Toronto, Ontario',
  hstNumber: '00000 0000 RT0001', // PLACEHOLDER — must be the real HST registration
} as const

/** Ontario HST — the default rate stamped on new documents. Historical
 *  documents render with the rate stored on them, never this constant. */
export const DEFAULT_TAX_RATE = 0.13
