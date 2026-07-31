import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useContact } from '../../contacts/api'
import { formatDateTime } from '../../../lib/format'
import { CommsThread } from '../components/CommsThread'
import { useInbox } from '../api'

export function InboxPage() {
  const { data: threads, isPending, isError, error, refetch } = useInbox()
  const [selected, setSelected] = useState<string | null>(null)

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-stone-900">Inbox</h1>
      <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
        <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
          {isPending && <p className="p-4 text-sm text-stone-500">Loading threads…</p>}
          {isError && (
            <div className="p-4">
              <p className="mb-2 text-sm text-red-600">Could not load the inbox. {error.message}</p>
              <button
                onClick={() => void refetch()}
                className="rounded border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-50"
              >
                Retry
              </button>
            </div>
          )}
          {threads && threads.length === 0 && (
            <p className="p-4 text-sm text-stone-500">
              No SMS threads yet. Conversations appear here as texts come in.
            </p>
          )}
          <ul className="divide-y divide-stone-100">
            {threads?.map((t) => (
              <li key={t.contact_id}>
                <button
                  onClick={() => setSelected(t.contact_id)}
                  className={`block w-full px-4 py-3 text-left hover:bg-stone-50 ${
                    selected === t.contact_id ? 'bg-amber-50' : ''
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium text-stone-900">
                      {t.contact_name}
                      {t.auto_created && (
                        <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-[10px] text-amber-800">
                          unverified
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-[10px] text-stone-400">
                      {formatDateTime(t.last_at)}
                    </span>
                  </div>
                  <p className="truncate text-xs text-stone-500">
                    {t.last_channel === 'messenger' && <span title="Messenger">💠 </span>}
                    {t.last_channel === 'instagram' && <span title="Instagram">📸 </span>}
                    {t.last_direction === 'outbound' ? 'You: ' : ''}
                    {t.last_body ?? '(media)'}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </div>
        {selected ? (
          <SelectedThread contactId={selected} />
        ) : (
          <p className="py-24 text-center text-sm text-stone-400">Pick a conversation.</p>
        )}
      </div>
    </div>
  )
}

function SelectedThread({ contactId }: { contactId: string }) {
  const { data: contact, isPending, isError, error } = useContact(contactId)
  if (isPending) return <p className="py-12 text-center text-sm text-stone-500">Loading…</p>
  if (isError) return <p className="py-12 text-center text-sm text-red-600">{error.message}</p>
  return (
    <div>
      <div className="mb-2 text-right">
        <Link to={`/contacts/${contact.id}`} className="text-sm text-amber-700 hover:underline">
          Open contact →
        </Link>
      </div>
      <CommsThread
        contactId={contact.id}
        contactName={contact.full_name}
        contactPhone={contact.phone}
      />
    </div>
  )
}
