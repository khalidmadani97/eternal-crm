import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAdSettings, useProcessConversions, useUpdateAdSettings } from '../api'

const schema = z.object({
  meta_pixel_id: z.string(),
  meta_capi_token: z.string(),
  google_ads_customer_id: z.string(),
  google_ads_developer_token: z.string(),
  google_ads_refresh_token: z.string(),
  google_ads_oauth_client_id: z.string(),
  google_ads_oauth_client_secret: z.string(),
  google_ads_conversion_action: z.string(),
})
type FormValues = z.infer<typeof schema>

type NullableAdPatch = Record<string, string | null>

function nullifyEmpty(values: FormValues): NullableAdPatch {
  return Object.fromEntries(
    Object.entries(values).map(([k, v]) => [k, v.trim() === '' ? null : v.trim()]),
  )
}

export function AdTrackingPanel() {
  const { data: settings, isPending, isError, error } = useAdSettings()
  const update = useUpdateAdSettings()
  const processConversions = useProcessConversions()
  const [saved, setSaved] = useState(false)
  const [retryResult, setRetryResult] = useState<string | null>(null)
  const [showMetaToken, setShowMetaToken] = useState(false)
  const [showGoogleSecrets, setShowGoogleSecrets] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
    reset,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    values: settings
      ? {
          meta_pixel_id: settings.meta_pixel_id ?? '',
          meta_capi_token: settings.meta_capi_token ?? '',
          google_ads_customer_id: settings.google_ads_customer_id ?? '',
          google_ads_developer_token: settings.google_ads_developer_token ?? '',
          google_ads_refresh_token: settings.google_ads_refresh_token ?? '',
          google_ads_oauth_client_id: settings.google_ads_oauth_client_id ?? '',
          google_ads_oauth_client_secret: settings.google_ads_oauth_client_secret ?? '',
          google_ads_conversion_action: settings.google_ads_conversion_action ?? '',
        }
      : undefined,
  })

  const onSubmit = async (values: FormValues) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await update.mutateAsync(nullifyEmpty(values) as any)
    setSaved(true)
    reset(values)
    setTimeout(() => setSaved(false), 3000)
  }

  const retryConversions = async () => {
    setRetryResult(null)
    const r = await processConversions.mutateAsync()
    setRetryResult(
      `Processed ${r.processed} — Meta: ${r.meta.sent} sent, ${r.meta.skipped} skipped | Google: ${r.google.sent} sent, ${r.google.skipped} skipped`,
    )
  }

  const inputClass =
    'w-full rounded border border-stone-300 px-3 py-2 text-sm focus:border-amber-600 focus:outline-none font-mono'

  if (isPending) return <p className="py-2 text-sm text-stone-500">Loading…</p>
  if (isError) return <p className="py-2 text-sm text-red-600">{error.message}</p>

  return (
    <div className="space-y-5">
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        {/* ── Meta Conversions API ─────────────────────────────────── */}
        <section className="max-w-2xl rounded-lg border border-stone-200 bg-white p-4">
          <h2 className="mb-0.5 text-sm font-semibold uppercase tracking-wide text-stone-500">
            Meta Conversions API
          </h2>
          <p className="mb-4 text-xs text-stone-400">
            Sends a server-side Purchase event to Meta when a job is marked Won — closes the
            attribution loop for Meta Ads campaigns. Matching uses hashed email + phone; no
            browser pixel required.
          </p>

          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-stone-700">Pixel ID</label>
              <input
                {...register('meta_pixel_id')}
                placeholder="1234567890123456"
                className={inputClass}
              />
              {errors.meta_pixel_id && (
                <p className="mt-1 text-xs text-red-600">{errors.meta_pixel_id.message}</p>
              )}
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="text-sm font-medium text-stone-700">CAPI Access Token</label>
                <button
                  type="button"
                  onClick={() => setShowMetaToken((v) => !v)}
                  className="text-xs text-stone-400 hover:text-stone-700"
                >
                  {showMetaToken ? 'hide' : 'show'}
                </button>
              </div>
              <input
                {...register('meta_capi_token')}
                type={showMetaToken ? 'text' : 'password'}
                placeholder="System user access token from Meta Events Manager"
                className={inputClass}
              />
              <p className="mt-1 text-xs text-stone-400">
                Meta Events Manager → Data Sources → your Pixel → Settings → Generate access token
              </p>
            </div>
          </div>
        </section>

        {/* ── Google Ads ────────────────────────────────────────────── */}
        <section className="mt-4 max-w-2xl rounded-lg border border-stone-200 bg-white p-4">
          <h2 className="mb-0.5 text-sm font-semibold uppercase tracking-wide text-stone-500">
            Google Ads Enhanced Conversions
          </h2>
          <p className="mb-4 text-xs text-stone-400">
            Uploads an offline conversion to Google Ads when a job is Won — tells Google which
            clicks produced real revenue. Uses hashed email + phone (no gclid required). Requires
            "Enhanced conversions for leads" enabled on the conversion action in Google Ads.
          </p>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-stone-700">
                  Customer ID
                </label>
                <input
                  {...register('google_ads_customer_id')}
                  placeholder="123-456-7890"
                  className={inputClass}
                />
                <p className="mt-1 text-xs text-stone-400">Digits only or dashes OK</p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-stone-700">
                  Conversion Action ID
                </label>
                <input
                  {...register('google_ads_conversion_action')}
                  placeholder="987654321"
                  className={inputClass}
                />
                <p className="mt-1 text-xs text-stone-400">
                  Google Ads → Goals → Conversions → click the action → ID in URL
                </p>
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-stone-700">OAuth credentials</span>
                <button
                  type="button"
                  onClick={() => setShowGoogleSecrets((v) => !v)}
                  className="text-xs text-stone-400 hover:text-stone-700"
                >
                  {showGoogleSecrets ? 'hide secrets' : 'show secrets'}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-stone-600">
                    Developer Token
                  </label>
                  <input
                    {...register('google_ads_developer_token')}
                    type={showGoogleSecrets ? 'text' : 'password'}
                    placeholder="Google Cloud Console"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-stone-600">
                    OAuth Client ID
                  </label>
                  <input
                    {...register('google_ads_oauth_client_id')}
                    type={showGoogleSecrets ? 'text' : 'password'}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-stone-600">
                    OAuth Client Secret
                  </label>
                  <input
                    {...register('google_ads_oauth_client_secret')}
                    type={showGoogleSecrets ? 'text' : 'password'}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-stone-600">
                    Refresh Token
                  </label>
                  <input
                    {...register('google_ads_refresh_token')}
                    type={showGoogleSecrets ? 'text' : 'password'}
                    className={inputClass}
                  />
                </div>
              </div>
              <p className="mt-2 text-xs text-stone-400">
                Google Cloud Console → APIs &amp; Services → OAuth 2.0. Refresh token via the Google
                OAuth Playground with the <em>Google Ads API</em> scope.
              </p>
            </div>
          </div>
        </section>

        <div className="mt-4 flex items-center gap-3">
          <button
            type="submit"
            disabled={update.isPending || !isDirty}
            className="rounded bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
          >
            {update.isPending ? 'Saving…' : 'Save credentials'}
          </button>
          {saved && <span className="text-sm text-emerald-600">Saved ✓</span>}
          {update.isError && (
            <span className="text-sm text-red-600">{update.error.message}</span>
          )}
        </div>
      </form>

      {/* ── Manual retry ─────────────────────────────────────────────── */}
      <section className="max-w-2xl rounded-lg border border-stone-200 bg-white p-4">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-stone-500">
          Retry pending conversions
        </h2>
        <p className="mb-3 text-xs text-stone-400">
          Re-processes any won jobs whose conversion events haven't been sent yet — e.g. if the
          credentials were added after the job was won, or if a previous send failed.
        </p>
        <button
          type="button"
          onClick={() => void retryConversions()}
          disabled={processConversions.isPending}
          className="rounded border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
        >
          {processConversions.isPending ? 'Processing…' : 'Run now'}
        </button>
        {retryResult && <p className="mt-2 text-xs text-stone-600">{retryResult}</p>}
        {processConversions.isError && (
          <p className="mt-2 text-xs text-red-600">{processConversions.error.message}</p>
        )}
      </section>
    </div>
  )
}
