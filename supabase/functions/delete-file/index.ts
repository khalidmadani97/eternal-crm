// Deletes a job file: Storage object FIRST via the Storage API, then the
// metadata row through the service-role delete_file() RPC, which authorises
// the files_delete_guard() trigger (DECISIONS 018).
//
// Callable only by an authenticated staff user; runs with the service role.

import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS })
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const authHeader = req.headers.get('Authorization') ?? ''
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // The caller must be a signed-in staff user — this function is not public.
  const asCaller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userError } = await asCaller.auth.getUser()
  if (userError || !userData.user) {
    return json({ error: 'Not authenticated' }, 401)
  }

  let fileId: unknown
  try {
    ;({ fileId } = await req.json())
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  if (typeof fileId !== 'string') {
    return json({ error: 'fileId is required' }, 400)
  }

  const service = createClient(supabaseUrl, serviceKey)

  const { data: file, error: fetchError } = await service
    .from('files')
    .select('id, storage_path')
    .eq('id', fileId)
    .maybeSingle()
  if (fetchError) return json({ error: fetchError.message }, 500)
  if (!file) return json({ error: 'File not found' }, 404)

  // Object first. If this fails, nothing has been deleted.
  const { error: storageError } = await service.storage
    .from('job-files')
    .remove([file.storage_path])
  if (storageError) {
    return json({ error: `Storage removal failed: ${storageError.message}` }, 500)
  }

  // Row second. If this fails we have a visible dangling row — recoverable.
  const { error: rpcError } = await service.rpc('delete_file', { p_file_id: fileId })
  if (rpcError) {
    return json(
      { error: `Object removed but row deletion failed: ${rpcError.message}` },
      500,
    )
  }

  return json({ ok: true })
})

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}
