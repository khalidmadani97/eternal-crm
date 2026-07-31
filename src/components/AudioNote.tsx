import { useState } from 'react'
import { supabase } from '../lib/supabase'

/** Playable voice memo attached to a note (Slice 23). The signed URL is
 *  fetched on demand — lists render instantly. */
export function AudioNote({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState(false)

  const load = async () => {
    const { data, error } = await supabase.storage.from('job-files').createSignedUrl(path, 300)
    if (error) setError(true)
    else setUrl(data.signedUrl)
  }

  if (error) return <span className="text-xs text-red-600">Recording unavailable</span>
  if (!url)
    return (
      <button
        onClick={() => void load()}
        className="mt-1 rounded border border-stone-300 px-2 py-0.5 text-xs text-stone-600 hover:bg-stone-50"
      >
        ▶ Play voice note
      </button>
    )
  return <audio controls autoPlay src={url} className="mt-1 h-8 w-full max-w-xs" />
}
