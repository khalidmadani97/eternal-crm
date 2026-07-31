import { useEffect, useState } from 'react'
import { normalizePhone } from '../../../lib/format'
import { useBusinessSettings, useUpdateBusinessSettings } from '../api'

/** Business identity (Slice 31) — renders on every quote, invoice, and
 *  contract. The HST number is legally required on invoices. */
export function BusinessPanel() {
  const { data: settings, isPending, isError, error } = useBusinessSettings()
  const update = useUpdateBusinessSettings()
  const [form, setForm] = useState({
    name: '', tagline: '', phone: '', email: '', address: '', hst_number: '', default_tax_rate: '13',
  })
  const [saved, setSaved] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)

  useEffect(() => {
    if (settings) {
      setForm({
        name: settings.name,
        tagline: settings.tagline ?? '',
        phone: settings.phone ?? '',
        email: settings.email ?? '',
        address: settings.address ?? '',
        hst_number: settings.hst_number ?? '',
        default_tax_rate: (Number(settings.default_tax_rate) * 100).toString(),
      })
    }
  }, [settings])

  const save = () => {
    if (!form.name.trim()) {
      setValidationError('Business name is required')
      return
    }
    const phone = form.phone.trim() ? normalizePhone(form.phone) : null
    if (form.phone.trim() && !phone) {
      setValidationError('Enter a valid phone number')
      return
    }
    const rate = Number(form.default_tax_rate)
    if (Number.isNaN(rate) || rate < 0 || rate > 30) {
      setValidationError('Tax rate must be a percentage between 0 and 30')
      return
    }
    setValidationError(null)
    update.mutate(
      {
        name: form.name.trim(),
        tagline: form.tagline.trim() || null,
        phone,
        email: form.email.trim() || null,
        address: form.address.trim() || null,
        hst_number: form.hst_number.trim() || null,
        default_tax_rate: Math.round(rate * 100) / 10000,
      },
      {
        onSuccess: () => {
          setSaved(true)
          setTimeout(() => setSaved(false), 2000)
        },
      },
    )
  }

  const inputClass =
    'w-full rounded border border-stone-300 px-3 py-2 text-sm focus:border-amber-600 focus:outline-none'
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [key]: e.target.value })

  if (isPending) return <p className="py-4 text-sm text-stone-500">Loading business settings…</p>
  if (isError) return <p className="py-4 text-sm text-red-600">Could not load. {error.message}</p>

  return (
    <section className="max-w-2xl rounded-lg border border-stone-200 bg-white p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Business</h2>
      <p className="mb-3 text-xs text-stone-400">
        Renders on every quote, invoice, and contract. The HST number is legally required on
        invoices — leave it blank and invoices will show a warning until it's set.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-stone-700">Business name</span>
          <input value={form.name} onChange={set('name')} className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-stone-700">Tagline</span>
          <input value={form.tagline} onChange={set('tagline')} className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-stone-700">Phone</span>
          <input value={form.phone} onChange={set('phone')} className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-stone-700">Email</span>
          <input value={form.email} onChange={set('email')} className={inputClass} />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block font-medium text-stone-700">Address</span>
          <input value={form.address} onChange={set('address')} className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-stone-700">HST registration #</span>
          <input
            value={form.hst_number}
            onChange={set('hst_number')}
            placeholder="12345 6789 RT0001"
            className={`${inputClass} ${!form.hst_number.trim() ? 'border-amber-400 bg-amber-50' : ''}`}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-stone-700">Default HST rate (%)</span>
          <input value={form.default_tax_rate} onChange={set('default_tax_rate')} inputMode="decimal" className={inputClass} />
          <span className="mt-1 block text-xs text-stone-400">
            Applied to new quotes/invoices only — issued documents keep their stored rate.
          </span>
        </label>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={save}
          disabled={update.isPending}
          className="rounded bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
        >
          {update.isPending ? 'Saving…' : 'Save'}
        </button>
        {saved && <span className="text-sm text-emerald-700">Saved.</span>}
        {(validationError || update.isError) && (
          <span className="text-sm text-red-600">{validationError ?? update.error?.message}</span>
        )}
      </div>
    </section>
  )
}
