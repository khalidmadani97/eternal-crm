# Deploying Eternal CRM → crm.eternalinteriors.ca

Frontend: **Cloudflare Pages** (domain already on Cloudflare).
Backend: **hosted Supabase** (own project — DECISIONS 017).

## Phase 1 — Supabase cloud project (~15 min)
1. supabase.com → New project → name `eternal-crm`, region `ca-central-1`
   (Toronto isn't offered; central Canada/us-east is fine). Save the
   **database password**.
2. Locally:
   ```
   npx supabase login
   npx supabase link --project-ref <PROJECT_REF>
   npx supabase db push          # applies all migrations (safe: push only)
   npx supabase functions deploy # deploys every edge function
   ```
3. Dashboard → Authentication → URL Configuration:
   - Site URL: `https://crm.eternalinteriors.ca`
   - Redirect URLs: `https://crm.eternalinteriors.ca/**`
   Auth → Providers → Email: min password length 12.
4. Function secrets (Dashboard → Edge Functions → Secrets), from the local
   `supabase/functions/.env` (NEVER commit it):
   AI_API_KEY, AI_API_BASE, AI_MODEL, OPENAI_API_KEY,
   ICS_FEED_TOKEN (generate a fresh long one),
   APP_URL=https://crm.eternalinteriors.ca,
   PUBLIC_SUPABASE_URL=https://<PROJECT_REF>.supabase.co,
   RESEND_API_KEY (when ready), TWILIO_*/STRIPE_*/META_*/GDRIVE_*/VAPID_* as
   each integration goes live.

## Phase 2 — move the real data (local → cloud, ~10 min)
The local DB holds live business data (196+ leads). One-shot copy:
```
docker exec supabase_db_Custom_crm pg_dump -U postgres --data-only \
  --schema=public --disable-triggers postgres > /tmp/crm-data.sql
psql "postgresql://postgres:<DB_PASSWORD>@db.<PROJECT_REF>.supabase.co:5432/postgres" \
  -c 'set session_replication_role = replica;' -f /tmp/crm-data.sql
```
Then recreate auth users (Dashboard → Authentication → Add user) for each
teammate — emails must match their `profiles.email` rows, and set each
auth user's UUID to the existing profile id via SQL editor if prompted;
simpler: create users FIRST with matching ids using the admin API (ask
Claude to script it against the cloud project).
Storage objects (receipts/voice notes/signed PDFs) copy via
`supabase storage cp` or fresh start if acceptable.

## Phase 3 — Cloudflare Pages (~10 min)
1. Push this repo to GitHub (private).
2. Cloudflare dash → Workers & Pages → Create → Pages → connect the repo.
   - Build command: `npm run build`
   - Output directory: `dist`
   - Env vars: `VITE_SUPABASE_URL=https://<PROJECT_REF>.supabase.co`,
     `VITE_SUPABASE_ANON_KEY=<cloud anon key>`
     (+ `VITE_VAPID_PUBLIC_KEY`, `VITE_FEATURE_SOFTPHONE` when used)
3. `public/_redirects` (already in repo) makes SPA routing work.
4. Custom domains → add `crm.eternalinteriors.ca` → Cloudflare auto-creates
   the CNAME since the zone is local. HTTPS is automatic.

## Phase 4 — after it's live
- Sign in, Settings → Business: real HST number.
- Settings → Integrations: confirm green for AI/Whisper/calendar feed.
- Schedule backups + sheet sync: Dashboard → Edge Functions → Cron:
  `sync-lead-sheets` every 5 min (`{"action":"sync"}` w/ service key),
  `backup` daily.
- Webhooken (Twilio/Meta/Stripe) now point at
  `https://<PROJECT_REF>.supabase.co/functions/v1/<fn>`.

## Ongoing
Local stays the dev environment. Ship changes:
`npx supabase db push && npx supabase functions deploy` + git push (Pages
auto-deploys). Never run db reset against the linked project (DECISIONS 016).
