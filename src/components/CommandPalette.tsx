import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { formatPhone } from '../lib/format'

// Global search (Cmd/Ctrl+K) — the answer to "I can never find anything in
// a CRM". One box, four entities, keyboard-first.

interface SearchHit {
  type: 'job' | 'contact' | 'company' | 'invoice'
  id: string
  title: string
  subtitle: string
  url: string
}

function useGlobalSearch(term: string, enabled: boolean) {
  return useQuery({
    queryKey: ['global-search', term],
    enabled: enabled && term.trim().length >= 2,
    queryFn: async (): Promise<SearchHit[]> => {
      const q = term.trim()
      const like = `%${q}%`
      const [jobs, contacts, companies, invoices] = await Promise.all([
        supabase
          .from('jobs')
          .select('id, job_number, title, stage, contact:contacts(full_name)')
          .is('deleted_at', null)
          .or(`job_number.ilike.${like},title.ilike.${like}`)
          .limit(5),
        supabase
          .from('contacts')
          .select('id, full_name, phone, email')
          .is('deleted_at', null)
          .or(`full_name.ilike.${like},phone.ilike.${like},email.ilike.${like}`)
          .limit(5),
        supabase
          .from('companies')
          .select('id, name, type')
          .is('deleted_at', null)
          .ilike('name', like)
          .limit(4),
        supabase
          .from('invoices')
          .select('id, invoice_number, status, total, job:jobs(title)')
          .ilike('invoice_number', like)
          .limit(4),
      ])
      const hits: SearchHit[] = []
      for (const j of (jobs.data ?? []) as unknown as {
        id: string
        job_number: string
        title: string
        stage: string
        contact: { full_name: string } | null
      }[]) {
        hits.push({
          type: 'job',
          id: j.id,
          title: `${j.job_number} — ${j.title}`,
          subtitle: `${j.contact?.full_name ?? ''} · ${j.stage}`,
          url: `/jobs/${j.id}`,
        })
      }
      for (const c of contacts.data ?? []) {
        hits.push({
          type: 'contact',
          id: c.id,
          title: c.full_name,
          subtitle: [formatPhone(c.phone), c.email].filter((s) => s && s !== '—').join(' · '),
          url: `/contacts/${c.id}`,
        })
      }
      for (const co of companies.data ?? []) {
        hits.push({
          type: 'company',
          id: co.id,
          title: co.name,
          subtitle: co.type,
          url: `/companies/${co.id}`,
        })
      }
      for (const inv of (invoices.data ?? []) as unknown as {
        id: string
        invoice_number: string
        status: string
        job: { title: string } | null
      }[]) {
        hits.push({
          type: 'invoice',
          id: inv.id,
          title: inv.invoice_number,
          subtitle: `${inv.status} · ${inv.job?.title ?? ''}`,
          url: `/invoices/${inv.id}`,
        })
      }
      return hits
    },
  })
}

const TYPE_BADGES: Record<SearchHit['type'], string> = {
  job: 'bg-amber-100 text-amber-800',
  contact: 'bg-blue-100 text-blue-800',
  company: 'bg-purple-100 text-purple-800',
  invoice: 'bg-emerald-100 text-emerald-800',
}

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [term, setTerm] = useState('')
  const [selected, setSelected] = useState(0)
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const { data: hits, isFetching } = useGlobalSearch(term, open)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
        setTerm('')
        setSelected(0)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  const results = useMemo(() => hits ?? [], [hits])

  const go = (hit: SearchHit) => {
    setOpen(false)
    void navigate(hit.url)
  }

  if (!open)
    return (
      <button
        onClick={() => setOpen(true)}
        className="hidden items-center gap-2 rounded border border-stone-300 px-3 py-1.5 text-sm text-stone-400 hover:bg-stone-50 sm:flex"
      >
        Search… <kbd className="rounded bg-stone-100 px-1.5 text-xs text-stone-500">⌘K</kbd>
      </button>
    )

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="hidden items-center gap-2 rounded border border-stone-300 px-3 py-1.5 text-sm text-stone-400 sm:flex"
      >
        Search… <kbd className="rounded bg-stone-100 px-1.5 text-xs text-stone-500">⌘K</kbd>
      </button>
      <div
        className="fixed inset-0 z-30 flex items-start justify-center bg-black/40 pt-24"
        onClick={() => setOpen(false)}
      >
        <div
          className="w-full max-w-xl rounded-lg bg-white shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            ref={inputRef}
            value={term}
            onChange={(e) => {
              setTerm(e.target.value)
              setSelected(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setSelected((s) => Math.min(s + 1, results.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setSelected((s) => Math.max(s - 1, 0))
              } else if (e.key === 'Enter' && results[selected]) {
                go(results[selected])
              }
            }}
            placeholder="Search jobs, contacts, companies, invoices…"
            className="w-full rounded-t-lg border-b border-stone-200 px-4 py-3 text-base focus:outline-none"
          />
          <div className="max-h-96 overflow-y-auto p-2">
            {term.trim().length < 2 && (
              <p className="px-3 py-6 text-center text-sm text-stone-400">
                Type at least two characters. ↑↓ to move, Enter to open.
              </p>
            )}
            {term.trim().length >= 2 && !isFetching && results.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-stone-400">No matches.</p>
            )}
            {results.map((hit, i) => (
              <button
                key={`${hit.type}-${hit.id}`}
                onClick={() => go(hit)}
                onMouseEnter={() => setSelected(i)}
                className={`flex w-full items-center gap-3 rounded px-3 py-2 text-left ${
                  i === selected ? 'bg-amber-50' : ''
                }`}
              >
                <span
                  className={`w-16 shrink-0 rounded-full px-2 py-0.5 text-center text-[10px] font-medium ${TYPE_BADGES[hit.type]}`}
                >
                  {hit.type}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-stone-900">
                    {hit.title}
                  </span>
                  <span className="block truncate text-xs text-stone-400">{hit.subtitle}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
