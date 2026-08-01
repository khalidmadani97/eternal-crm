import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useJobs } from '../features/jobs/api'
import { SaraBot } from './SaraBot'
import type { SaraMood } from './SaraBot'

// Sara's chat (Slice 34): floating assistant, everywhere in the app. She
// reads the live snapshot server-side; the client just holds the
// conversation. Job numbers in her replies become links.

interface CreatedTask {
  title: string
  due_date: string
  assignee: string
  job_number: string | null
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  createdTasks?: CreatedTask[]
}

const SUGGESTIONS = [
  'What should I do today?',
  'Which leads are going quiet?',
  'Who owes us money?',
  "What's on the schedule this week?",
]

export function SaraChat() {
  const [open, setOpen] = useState(false)
  const [greeting, setGreeting] = useState(false)
  const [justAnswered, setJustAnswered] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [creditsLeft, setCreditsLeft] = useState<number | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const { data: jobs } = useJobs()
  const queryClient = useQueryClient()

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
      return data as { reply: string; createdTasks?: CreatedTask[]; usage?: { used: number; cap: number } }
    },
    onSuccess: (data) => {
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: data.reply, createdTasks: data.createdTasks },
      ])
      if (data.usage) setCreditsLeft(data.usage.cap - data.usage.used)
      if (data.createdTasks?.length) {
        void queryClient.invalidateQueries({ queryKey: ['tasks'] })
        void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      }
      setJustAnswered(true)
      setTimeout(() => setJustAnswered(false), 2500)
    },
  })

  // A one-time hello so people discover her (per browser).
  useEffect(() => {
    if (localStorage.getItem('sara-greeted')) return
    const timer = setTimeout(() => setGreeting(true), 2500)
    return () => clearTimeout(timer)
  }, [])
  const dismissGreeting = () => {
    setGreeting(false)
    localStorage.setItem('sara-greeted', '1')
  }

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
        <Link key={i} to={`/jobs/${job.id}`} className="font-medium text-violet-700 underline hover:text-violet-500" onClick={() => setOpen(false)}>
          {part}
        </Link>
      ) : (
        <span key={i}>{part}</span>
      )
    })
  }

  const mood: SaraMood = send.isPending ? 'thinking' : justAnswered || greeting || open ? 'happy' : 'idle'

  return (
    <>
      {greeting && !open && (
        <div className="sara-bubble fixed bottom-24 right-5 z-30 w-56 rounded-2xl rounded-br-sm border border-violet-200 bg-white p-3 shadow-xl">
          <p className="text-sm text-stone-700">
            Hi, I'm <span className="font-semibold text-violet-700">Sara</span>! 👋 Ask me what you
            should do today — I know every job, note, and invoice.
          </p>
          <div className="mt-2 flex justify-end gap-2">
            <button onClick={dismissGreeting} className="text-xs text-stone-400 hover:text-stone-600">
              Later
            </button>
            <button
              onClick={() => {
                dismissGreeting()
                setOpen(true)
              }}
              className="rounded-full bg-violet-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-violet-700"
            >
              Say hi
            </button>
          </div>
        </div>
      )}
      <button
        onClick={() => {
          if (greeting) dismissGreeting()
          setOpen((o) => !o)
        }}
        title="Ask Sara"
        aria-label="Ask Sara"
        className="sara-bob fixed bottom-5 right-5 z-30 rounded-full bg-white shadow-lg ring-2 ring-violet-400/70 transition-transform hover:scale-110"
      >
        <SaraBot size={56} mood={mood} />
      </button>

      {open && (
        <div className="fixed bottom-20 right-5 z-30 flex h-[32rem] w-96 max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between bg-stone-900 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span className="rounded-full bg-white/90 ring-1 ring-violet-400/60">
                <SaraBot size={36} mood={mood} />
              </span>
              <div>
              <p className="text-sm font-semibold text-violet-300">Sara</p>
              <p className="text-[11px] text-stone-400">
                Knows every lead, job, note, and invoice
                {creditsLeft !== null && ` · ${creditsLeft} credits left`}
              </p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="text-stone-400 hover:text-white">
              ✕
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.length === 0 && (
              <div>
                <div className="mb-2 flex justify-center">
                  <SaraBot size={72} mood="happy" />
                </div>
                <p className="mb-3 text-center text-sm text-stone-600">
                  Hi! I'm Sara. Ask me anything about the business — or try one of these:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => ask(s)}
                      className="rounded-full border border-violet-300 bg-violet-50 px-2.5 py-1 text-xs text-violet-800 hover:bg-violet-100"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i}>
                <div className={m.role === 'user' ? 'flex justify-end' : 'flex'}>
                  <div
                    className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                      m.role === 'user' ? 'bg-violet-600 text-white' : 'bg-stone-100 text-stone-800'
                    }`}
                  >
                    {m.role === 'assistant' ? renderContent(m.content) : m.content}
                  </div>
                </div>
                {m.createdTasks?.map((t, ti) => (
                  <Link
                    key={ti}
                    to="/tasks"
                    onClick={() => setOpen(false)}
                    className="mt-1.5 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-800 hover:bg-emerald-100"
                  >
                    ✓ Task on calendar: <span className="font-medium">{t.title}</span> · {t.due_date} ·{' '}
                    {t.assignee}
                    {t.job_number ? ` · ${t.job_number}` : ''}
                  </Link>
                ))}
              </div>
            ))}
            {send.isPending && (
              <p className="flex items-center gap-2 text-sm italic text-stone-400">
                <SaraBot size={26} mood="thinking" /> looking at the books…
              </p>
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
