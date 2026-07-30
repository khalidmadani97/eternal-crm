#!/usr/bin/env node
// Recreates the local dev login after a db reset (resets wipe auth users).
// LOCAL ONLY — wired into `npm run db:reset`, which is itself local-only
// (DECISIONS 016). Uses the standard local service-role key.

const LOCAL_URL = 'http://127.0.0.1:54321'
const LOCAL_SERVICE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const res = await fetch(`${LOCAL_URL}/auth/v1/admin/users`, {
  method: 'POST',
  headers: {
    apikey: LOCAL_SERVICE_KEY,
    Authorization: `Bearer ${LOCAL_SERVICE_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    email: 'khalid@eternalinteriors.ca',
    password: 'eternal-dev-2026',
    email_confirm: true,
    user_metadata: { full_name: 'Khalid Ahmad', role: 'admin' },
  }),
})
const data = await res.json()
if (res.ok) {
  console.log(`Dev user ready: ${data.email}`)
} else if (data.msg?.includes('already') || data.error_code === 'email_exists') {
  console.log('Dev user already exists.')
} else {
  console.error('Could not create dev user:', data)
  process.exit(1)
}
