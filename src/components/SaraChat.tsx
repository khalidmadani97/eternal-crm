import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useJobs } from '../features/jobs/api'

// Sara's chat (Slice 34): floating assistant, everywhere in the app. She
// reads the live snapshot server-side; the client just holds the
// conversation. Job numbers in her replies become links.

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

const SUGGESTIONS = [
  'What should I do today?',
  'Which leads are going quiet?',
  'Who owes us money?',
  "What's on the schedule this week?",
]

export function SaraChat() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [creditsLeft, setCreditsLeft] = useState<number | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const { data: jobs } = useJobs()

  const send = useMutation({
    mutationFn: async (history: ChatMessage[]) => {
      const { data, error } = await supabase.functions.invoke('sara-chat', {
        body: { messages: history },
      })
      if (error) {
        const context = (error as { context?: Response }).context
        if (context) {
          const parsed = await context.json().catch(() => null)
          if (parsed?.error) throw new Error(parsed.error)
        }
        throw error
      }
      return data as { reply: string; usage?: { used: number; cap: number } }
    },
    onSuccess: (data) => {
      setMessages((m) => [...m, { role: 'assistant', content: data.reply }])
      if (data.usage) setCreditsLeft(data.usage.cap - data.usage.used)
    },
  })

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'nearest' })
  }, [messages.length, send.isPending])

  const ask = (text: string) => {
    const content = text.trim()
    if (!content || send.isPending) return
    const next: ChatMessage[] = [...messages, { role: 'user', content }]
    setMessages(next)
    setDraft('')
    send.mutate(next)
  }

  // EI-2026-0004 → link to the job when we know it.
  const renderContent = (text: string) => {
    const parts = text.split(/(\b[A-Z]{1,4}-\d{4}-\d{4}\b)/g)
    return parts.map((part, i) => {
      const job = jobs?.find((j) => j.job_number === part)
      return job ? (
        <Link key={i} to={`/jobs/${job.id}`} className="font-medium text-amber-300 underline hover:text-amber-200" onClick={() => setOpen(false)}>
          {part}
        </Link>
      ) : (
        <span key={i}>{part}</span>
      )
    })
  }

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Ask Sara"
        className="fixed bottom-5 right-5 z-30 flex h-13 w-13 items-center justify-center rounded-full bg-stone-900 p-3.5 text-xl shadow-lg ring-1 ring-amber-500/40 transition-transform hover:scale-105"
      >
        ✨
      </button>

      {open && (
        <div className="fixed bottom-20 right-5 z-30 flex h-[32rem] w-96 max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between bg-stone-900 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-amber-400">Sara</p>
              <p className="text-[11px] text-stone-400">
                Knows every lead, job, note, and invoice
                {creditsLeft !== null && ` · ${creditsLeft} credits left`}
              </p>
            </div>
            <button onClick={() => setOpen(false)} className="text-stone-400 hover:text-white">
              ✕
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.length === 0 && (
              <div>
                <p className="mb-3 text-sm text-stone-600">
                  Hi! I'm Sara. Ask me anything about the business — or try one of these:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => ask(s)}
                      className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs text-amber-800 hover:bg-amber-100"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex'}>
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                    m.role === 'user' ? 'bg-amber-600 text-white' : 'bg-stone-900 text-stone-100'
                  }`}
                >
                  {m.role === 'assistant' ? renderContent(m.content) : m.content}
                </div>
              </div>
            ))}
            {send.isPending && (
              <p className="text-sm italic text-stone-400">Sara is looking at the books…</p>
            )}
            {send.isError && (
              <p className="text-sm text-red-600">
                {send.error.message.includes('configured')
                  ? 'Sara needs AI_API_KEY in the function secrets.'
                  : send.error.message}
              </p>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="border-t border-stone-200 p-3">
            <div className="flex gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') ask(draft)
                }}
                placeholder="Ask Sara…"
                className="flex-1 rounded-full border border-stone-300 px-4 py-2 text-sm focus:border-amber-600 focus:outline-none"
              />
              <button
                onClick={() => ask(draft)}
                disabled={send.isPending || !draft.trim()}
                className="rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
