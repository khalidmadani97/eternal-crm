// iCalendar feed of appointments (Slice 20) — subscribe from Google
// Calendar (Other calendars → From URL), Apple, or Outlook. Two modes:
//   GET + staff JWT            → JSON { url } — the tokened feed URL to paste
//   GET ?token=…[&assignee=…]  → the ICS feed itself (calendar apps poll it)
// The token is a single shared secret (small office; ICS_FEED_TOKEN in
// function secrets). Rotating the secret kills every old URL.

import { createClient } from 'npm:@supabase/supabase-js@2'

function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

function icsDate(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

const KIND_LABELS: Record<string, string> = {
  consultation: 'Consultation',
  template: 'Template',
  install: 'Install',
  service: 'Service',
  pickup: 'Pickup',
}

Deno.serve(async (req) => {
  if (req.method !== 'GET') return new Response('Method not allowed', { status: 405 })
  const feedToken = Deno.env.get('ICS_FEED_TOKEN')
  if (!feedToken) return new Response('Feed not configured — set ICS_FEED_TOKEN', { status: 503 })

  const url = new URL(req.url)
  const token = url.searchParams.get('token')

  if (!token) {
    // Staff asking for their feed URL.
    const asCaller = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    )
    const { data, error } = await asCaller.auth.getUser()
    if (error || !data.user) return new Response('Not authenticated', { status: 401 })
    const publicBase = Deno.env.get('PUBLIC_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL')!
    const base = `${publicBase}/functions/v1/calendar-feed?token=${feedToken}`
    return new Response(
      JSON.stringify({ url: base, personalUrl: `${base}&assignee=${data.user.id}` }),
      { headers: { 'Content-Type': 'application/json' } },
    )
  }

  if (token !== feedToken) return new Response('Invalid token', { status: 403 })

  const service = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
  const from = new Date(Date.now() - 30 * 24 * 3600_000).toISOString()
  const to = new Date(Date.now() + 365 * 24 * 3600_000).toISOString()
  let query = service
    .from('appointments')
    .select(
      `id, kind, starts_at, ends_at, notes, updated_at,
       assignee:profiles ( id, full_name ),
       job:jobs ( job_number, title, site_address, contact:contacts ( full_name ) )`,
    )
    .gte('starts_at', from)
    .lt('starts_at', to)
    .order('starts_at')
  const assignee = url.searchParams.get('assignee')
  if (assignee) query = query.eq('assigned_to', assignee)
  const { data: appointments, error } = await query
  if (error) return new Response(error.message, { status: 500 })

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Eternal Interiors//Eternal CRM//EN',
    'CALSCALE:GREGORIAN',
    'X-WR-CALNAME:Eternal CRM',
  ]
  for (const a of appointments as unknown as {
    id: string
    kind: string
    starts_at: string
    ends_at: string | null
    notes: string | null
    updated_at: string
    assignee: { full_name: string | null } | null
    job: {
      job_number: string
      title: string
      site_address: string | null
      contact: { full_name: string } | null
    } | null
  }[]) {
    const kindLabel = KIND_LABELS[a.kind] ?? a.kind
    const who = a.job?.contact?.full_name ?? a.job?.title ?? ''
    const summary = `[${kindLabel}] ${a.job?.job_number ?? ''} ${who}`.trim()
    const description = [
      a.job?.title,
      a.assignee?.full_name ? `Assigned: ${a.assignee.full_name}` : null,
      a.notes,
    ]
      .filter(Boolean)
      .join('\n')
    lines.push(
      'BEGIN:VEVENT',
      `UID:${a.id}@eternal-crm`,
      `DTSTAMP:${icsDate(a.updated_at)}`,
      `DTSTART:${icsDate(a.starts_at)}`,
      `DTEND:${icsDate(a.ends_at ?? new Date(new Date(a.starts_at).getTime() + 3600_000).toISOString())}`,
      `SUMMARY:${icsEscape(summary)}`,
      ...(a.job?.site_address ? [`LOCATION:${icsEscape(a.job.site_address)}`] : []),
      ...(description ? [`DESCRIPTION:${icsEscape(description)}`] : []),
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')

  return new Response(lines.join('\r\n'), {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8' },
  })
})
