// Backups (Slice 32, DECISIONS 031). Admin-only.
//   POST {action:'run'}   → dump every business table to JSON in the private
//                           backups bucket; upload a copy to the company
//                           Google Drive when GDRIVE_* secrets are set.
//   POST {action:'list'}  → recent backups with short-lived download URLs.
//
// Google Drive setup (one-time): create an OAuth client (Desktop), consent
// for https://www.googleapis.com/auth/drive.file with the company account,
// store GDRIVE_CLIENT_ID, GDRIVE_CLIENT_SECRET, GDRIVE_REFRESH_TOKEN, and
// GDRIVE_FOLDER_ID in function secrets.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { CORS_HEADERS, json, requireStaff } from '../_shared/twilio.ts'

const TABLES = [
  'profiles', 'companies', 'contacts', 'jobs', 'appointments',
  'quotes', 'quote_line_items', 'invoices', 'invoice_line_items',
  'payments', 'contracts', 'activities', 'tasks', 'files',
  'calls', 'messages', 'dm_messages', 'channel_identities',
  'consent_records', 'inbound_leads', 'expenses', 'stage_settings',
  'option_items', 'business_settings', 'ai_usage', 'ai_allowances',
  'push_subscriptions',
]

function service() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
}

async function requireAdmin(req: Request): Promise<{ userId: string } | Response> {
  try {
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
    if (JSON.parse(atob(token.split('.')[1])).role === 'service_role') {
      return { userId: 'cron' } // scheduler — gateway already verified the JWT
    }
  } catch { /* fall through to staff auth */ }
  const auth = await requireStaff(req)
  if (auth instanceof Response) return auth
  const { data } = await service().from('profiles').select('role').eq('id', auth.userId).single()
  if (data?.role !== 'admin') return json({ error: 'Admins only' }, 403)
  return auth
}

async function driveAccessToken(): Promise<string | null> {
  const clientId = Deno.env.get('GDRIVE_CLIENT_ID')
  const clientSecret = Deno.env.get('GDRIVE_CLIENT_SECRET')
  const refreshToken = Deno.env.get('GDRIVE_REFRESH_TOKEN')
  if (!clientId || !clientSecret || !refreshToken) return null
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`Google token refresh failed: ${data?.error_description ?? res.status}`)
  return data.access_token
}

async function uploadToDrive(accessToken: string, filename: string, content: Uint8Array): Promise<string> {
  const folderId = Deno.env.get('GDRIVE_FOLDER_ID')
  const metadata = {
    name: filename,
    ...(folderId ? { parents: [folderId] } : {}),
  }
  const boundary = 'backup-boundary-7f3a'
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
    JSON.stringify(metadata),
    `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n`,
    content,
    `\r\n--${boundary}--`,
  ])
  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  )
  const data = await res.json()
  if (!res.ok) throw new Error(`Drive upload failed: ${data?.error?.message ?? res.status}`)
  return data.id
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const auth = await requireAdmin(req)
  if (auth instanceof Response) return auth

  let action: unknown
  try {
    ;({ action } = await req.json())
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  const sb = service()

  if (action === 'list') {
    const { data: objects, error } = await sb.storage.from('backups').list('', {
      limit: 20,
      sortBy: { column: 'created_at', order: 'desc' },
    })
    if (error) return json({ error: error.message }, 500)
    const backups = []
    for (const o of objects ?? []) {
      const { data: signed } = await sb.storage.from('backups').createSignedUrl(o.name, 300)
      backups.push({
        name: o.name,
        created_at: o.created_at,
        size: o.metadata?.size ?? null,
        url: signed?.signedUrl ?? null,
      })
    }
    return json({
      backups,
      driveConfigured: !!(Deno.env.get('GDRIVE_CLIENT_ID') && Deno.env.get('GDRIVE_REFRESH_TOKEN')),
    })
  }

  if (action === 'run') {
    const dump: Record<string, unknown[]> = {}
    let totalRows = 0
    for (const table of TABLES) {
      const rows: unknown[] = []
      for (let from = 0; ; from += 1000) {
        const { data, error } = await sb.from(table).select('*').range(from, from + 999)
        if (error) return json({ error: `${table}: ${error.message}` }, 500)
        rows.push(...(data ?? []))
        if (!data || data.length < 1000) break
      }
      dump[table] = rows
      totalRows += rows.length
    }
    const payload = new TextEncoder().encode(
      JSON.stringify({ exported_at: new Date().toISOString(), tables: dump }),
    )
    const filename = `eternal-crm-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`

    const { error: uploadError } = await sb.storage
      .from('backups')
      .upload(filename, payload, { contentType: 'application/json' })
    if (uploadError) return json({ error: uploadError.message }, 500)

    let driveFileId: string | null = null
    let driveError: string | null = null
    try {
      const token = await driveAccessToken()
      if (token) driveFileId = await uploadToDrive(token, filename, payload)
    } catch (e) {
      driveError = e instanceof Error ? e.message : String(e)
    }

    return json({
      ok: true,
      filename,
      tables: TABLES.length,
      rows: totalRows,
      bytes: payload.length,
      drive: driveFileId ? { fileId: driveFileId } : { skipped: true, error: driveError },
    })
  }

  return json({ error: 'action must be run or list' }, 400)
})
