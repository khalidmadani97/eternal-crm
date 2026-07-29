import { useEffect, useRef, useState } from 'react'
import { formatDateTime, formatPhone } from '../../../lib/format'
import { commsFileUrl, useSendSms, useStartCall, useThread } from '../api'

interface Props {
  contactId: string
  contactName: string
  contactPhone: string | null
  jobId?: string
}

export function CommsThread({ contactId, contactName, contactPhone, jobId }: Props) {
  const { data: messages, isPending, isError, error } = useThread(contactId)
  const sendSms = useSendSms(contactId)
  const startCall = useStartCall()
  const [draft, setDraft] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'nearest' })
  }, [messages?.length])

  const send = async () => {
    const body = draft.trim()
    if (!body) return
    await sendSms.mutateAsync({ body, jobId })
    setDraft('')
  }

  const openMedia = async (path: string) => {
    const url = await commsFileUrl(path)
    window.open(url, '_blank')
  }

  return (
    <section className="flex h-96 flex-col rounded-lg border border-stone-200 bg-white">
      <div className="flex items-center justify-between border-b border-stone-200 px-4 py-2">
        <div>
          <h2 className="text-sm font-semibold text-stone-800">{contactName}</h2>
          <p className="text-xs text-stone-400">{formatPhone(contactPhone)}</p>
        </div>
        <button
          onClick={() => startCall.mutate({ contactId, jobId })}
          disabled={startCall.isPending || !contactPhone}
          className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          {startCall.isPending ? 'Calling…' : '📞 Call'}
        </button>
      </div>
      {startCall.isError && (
        <p className="border-b border-red-100 bg-red-50 px-4 py-1.5 text-xs text-red-700">
          {startCall.error.message}
        </p>
      )}
      {startCall.isSuccess && (
        <p className="border-b border-emerald-100 bg-emerald-50 px-4 py-1.5 text-xs text-emerald-700">
          Calling your cell — answer to connect the client.
        </p>
      )}

      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {isPending && <p className="text-sm text-stone-500">Loading messages…</p>}
        {isError && <p className="text-sm text-red-600">Could not load messages. {error.message}</p>}
        {messages && messages.length === 0 && (
          <p className="text-sm text-stone-500">No messages yet.</p>
        )}
        {messages?.map((m) => (
          <div key={m.id} className={m.direction === 'outbound' ? 'flex justify-end' : 'flex'}>
            <div
              className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                m.direction === 'outbound'
                  ? 'bg-stone-900 text-white'
                  : 'bg-stone-100 text-stone-900'
              }`}
            >
              {m.body && <p className="whitespace-pre-wrap">{m.body}</p>}
              {m.media_paths?.map((p) => (
                <button
                  key={p}
                  onClick={() => void openMedia(p)}
                  className="mt-1 block text-xs underline opacity-80"
                >
                  📎 attachment
                </button>
              ))}
              <p
                className={`mt-1 text-[10px] ${
                  m.direction === 'outbound' ? 'text-stone-400' : 'text-stone-400'
                }`}
              >
                {formatDateTime(m.created_at)} · {m.status}
                {m.error_code ? ` (${m.error_code})` : ''}
              </p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-stone-200 p-3">
        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void send()
            }}
            placeholder={contactPhone ? 'Text message…' : 'Contact has no phone number'}
            disabled={!contactPhone}
            className="flex-1 rounded border border-stone-300 px-3 py-2 text-sm focus:border-amber-600 focus:outline-none disabled:bg-stone-50"
          />
          <button
            onClick={() => void send()}
            disabled={sendSms.isPending || !draft.trim() || !contactPhone}
            className="rounded bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
          >
            {sendSms.isPending ? 'Sending…' : 'Send'}
          </button>
        </div>
        {sendSms.isError && <p className="mt-1 text-xs text-red-600">{sendSms.error.message}</p>}
      </div>
    </section>
  )
}
