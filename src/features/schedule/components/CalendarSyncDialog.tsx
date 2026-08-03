import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../../lib/supabase'

/** Google Calendar link (Slice 20): fetches the tokened ICS feed URL and
 *  walks the user through subscribing. Works for Apple/Outlook too. */
export function CalendarSyncDialog({ onClose }: { onClose: () => void }) {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['calendar-feed-url'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('calendar-feed', { method: 'GET' })
      if (error) {
        const context = (error as { context?: Response }).context
        if (context) {
          const text = await context.text().catch(() => '')
          throw new Error(text || error.message)
        }
        throw error
      }
      return data as { url: string; personalUrl: string }
    },
  })
  const [copied, setCopied] = useState<string | null>(null)

  const copy = async (which: 'all' | 'mine', url: string) => {
    await navigator.clipboard.writeText(url)
    setCopied(which)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-4 shadow-xl sm:p-6">
        <h2 className="mb-2 text-lg font-semibold text-stone-900">Link to Google Calendar</h2>
        <ol className="mb-4 list-decimal space-y-1 pl-5 text-sm text-stone-600">
          <li>Copy a feed URL below.</li>
          <li>
            In Google Calendar: <strong>Other calendars → + → From URL</strong>, paste, Add.
          </li>
          <li>Done — appointments appear and stay in sync (Google refreshes every few hours).</li>
        </ol>
        {isPending && <p className="py-2 text-sm text-stone-500">Getting your feed URL…</p>}
        {isError && (
          <p className="py-2 text-sm text-red-600">
            {error.message.includes('503') || error.message.includes('configured')
              ? 'The feed is not configured yet — set ICS_FEED_TOKEN in the function secrets.'
              : `Could not get the feed URL. ${error.message}`}
          </p>
        )}
        {data && (
          <div className="space-y-3">
            <FeedRow
              label="Whole team calendar"
              url={data.url}
              copied={copied === 'all'}
              onCopy={() => void copy('all', data.url)}
            />
            <FeedRow
              label="Just my appointments"
              url={data.personalUrl}
              copied={copied === 'mine'}
              onCopy={() => void copy('mine', data.personalUrl)}
            />
            <p className="text-xs text-stone-400">
              Anyone with a URL can read the schedule — treat it like a password. The same URL works
              in Apple Calendar and Outlook.
            </p>
          </div>
        )}
        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="rounded border border-stone-300 px-4 py-2 text-sm text-stone-700 hover:bg-stone-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

function FeedRow({
  label,
  url,
  copied,
  onCopy,
}: {
  label: string
  url: string
  copied: boolean
  onCopy: () => void
}) {
  return (
    <div>
      <p className="mb-1 text-sm font-medium text-stone-700">{label}</p>
      <div className="flex gap-2">
        <input
          readOnly
          value={url}
          onFocus={(e) => e.target.select()}
          className="flex-1 truncate rounded border border-stone-300 bg-stone-50 px-3 py-2 text-xs text-stone-600"
        />
        <button
          onClick={onCopy}
          className="rounded bg-stone-900 px-3 py-2 text-sm font-medium text-white hover:bg-stone-800"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
    </div>
  )
}
