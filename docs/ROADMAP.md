# Roadmap

Fifteen vertical slices, 0–14. **One slice per Claude Code session.** Each ends
in a working, committed, verified state. Do not start the next slice until the
current one's acceptance criteria pass.

Mark slices done here as you go. Claude Code reads this file to know where it is.

---

## Slice 0 — Foundation
**Status:** done (2026-07-29) — migration + seed run clean on a fresh local DB;
`next_document_number('INV')` returned consecutive INV-2026-0004/0005; types
generated; build and lint pass

Repo (git init, .gitignore), tooling, Supabase link, the **complete** schema,
seed data. The schema ships whole — later slices build UI and edge functions
against tables that already exist; a genuine modelling error found later is a
new migration plus a DECISIONS entry.

- Vite + React + TS strict, Tailwind, TanStack Query, React Router, react-hook-form + zod
- Supabase CLI linked to the CRM's own Supabase project (DECISIONS 017)
- One migration containing every enum and table in `docs/SCHEMA.md` — including
  `calls`, `messages`, `consent_records`, and `inbound_leads` — with RLS and the
  explicit delete-policy matrix, indexes on all FKs (plus `contacts.phone`),
  E.164 CHECK constraints, the `updated_at` trigger, the stage-change trigger
  (which also stamps `won_at`/`lost_at`), the append-only guard, the SMS
  consent-block trigger, and `record_call()` / `record_message()`
- `next_document_number(prefix)` backed by the gapless `document_counters` table
- Seed script: 3 companies, 8 contacts, 12 jobs spread across stages, a few
  quotes, invoices, payments, appointments

**Acceptance:** migration runs clean on a fresh DB. Seed data visible in the
Supabase table editor. Two back-to-back `next_document_number('INV')` calls
return consecutive numbers. Types generated. App builds and serves a blank page.

**Do not write any UI in this slice.** Verify the schema in the table editor first
— it is the only thing that is expensive to change later.

---

## Slice 1 — Auth and shell
**Status:** done (2026-07-29) — signup trigger verified (admin-created user got
a profiles row with role from metadata); login rejects bad credentials; RLS +
grant matrix verified positive and negative via REST (DECISIONS 020 fixed
missing table grants); shell/redirect logic in place, verified by code
walkthrough — worth one manual browser pass

- Supabase email/password auth, no signup — accounts created manually
- `profiles` row created by trigger on user insert
- Protected route wrapper, redirect to login
- App shell: sidebar (Jobs, Board, Calendar, Contacts, Invoices, Reports), header
  with current user and sign out

**Acceptance:** log in, see the shell, sign out, get redirected. Direct navigation
to a protected URL while logged out redirects to login.

---

## Slice 2 — Jobs list
**Status:** done (2026-07-29) — all 12 seeded jobs render via the verified list
query; create-job persisted EI-2026-0013 (consecutive); filters/sort are
client-side over the fetched list (small dataset, one query — revisit if jobs
exceed a few thousand); loading/empty/error states present. Note: job-number
RPC + insert are two steps, so a failed insert can gap EI numbers — cosmetic
for jobs; invoices must mint inside one server-side function (Slice 8).

- Table: job number, title, contact, company, stage badge, value, install date,
  assigned to
- Filter by stage, assignee, lead source. Text search on job number, title, contact
- Sort by created, install date, value
- "New job" form — contact (searchable select, with inline create), title, site
  address, value estimate, lead source

**Acceptance:** all 12 seeded jobs render. Each filter narrows correctly. Creating
a job persists it and it appears in the list. Loading, empty, and error states all
present.

---

## Slice 3 — Job detail
**Status:** done (2026-07-29) — stage-change trigger verified (activities row
with from/to; won_at stamped); notes persist newest-first; task add/complete
verified; file upload → signed-URL download → edge-function delete verified
end to end (object removed first, then row via service-role RPC; direct
client DELETE denied). Fix along the way: delete_file() needed an explicit
service_role execute grant after the public revoke.

- Header: job number, title, stage selector, contact and company links, value
- Stage change writes an `activities` row via trigger — verify the trigger fires
- Activity timeline, newest first, with a note composer
- File upload to Storage with a `kind` selector, list with download links
- File delete path (own migration): edge function removes the Storage object
  via the Storage API **first**, then a service-role RPC deletes the row and
  authorises the Slice 0 guard (DECISIONS 018)
- Tasks list scoped to the job, inline add and complete
- Editable fields: title, site address, values, lead source, assignee

**Acceptance:** change a stage and the timeline records it with from/to. Upload a
file and download it back. Add and complete a task. Notes persist and order
correctly.

---

## Slice 4 — Pipeline board
**Status:** done (2026-07-29) — native HTML5 drag (no new dependency), stage
move verified persisted across re-read; column count/value totals use the
same coalesce(value_final, value_est) semantics as SQL and reconcile against
seed data; optimistic update snapshots the cache and rolls back on error with
a visible banner; lost drops open the blocking reason dialog. Drag + rollback
paths verified by code walkthrough — worth a manual feel-check since this
replaces Trello.

- Kanban by `job_stage`, drag between columns, optimistic update with rollback
- Card: job number, contact, value, install date, assignee
- Column headers show count and summed value
- Moving to `lost` prompts for a reason and blocks until one is given

**Acceptance:** drag a card, refresh, it stayed. Column totals are correct. A
failed update rolls the card back visibly. This is the screen that replaces Trello
— if it is not pleasant to use, fix it before moving on.

---

## Slice 5 — Contacts and companies
**Status:** done (2026-07-29) — company detail shows every job with matching
company_id; referred totals reconcile exactly against SQL for all three seed
companies; hard DELETE denied at the DB, soft delete hides from lists;
auto-created contacts filtered out by default with a "show unverified"
toggle; editing an unverified contact marks it verified.

- Contacts list and detail with job history
- Companies list and detail with contacts and all referred jobs, plus total
  referred value
- Create and edit both. Soft delete only.

**Acceptance:** a company detail page shows every job where it is the
`company_id`, with the correct total.

---

## Slice 6 — Scheduling
**Status:** done (2026-07-29) — month/week grid hand-rolled (no calendar
dependency); template + install created from a job land on the right days in
the range query; drag-reschedule shifts starts_at and ends_at by the same
delta (verified); assignee filter and kind colours in place; /field shows
today's appointments with thumb-size Navigate / Call / photo-upload /
mark-complete actions (template→templated, install→installed; other kinds
have no field-completable stage).

- Month and week calendar reading from `appointments`
- Colour by `kind`, filter by assignee
- Create from the calendar or from the job detail page
- Drag to reschedule
- Job detail shows that job's upcoming appointments

**Acceptance:** create a template visit and an install from a job, both appear on
the calendar on the right days. Dragging changes `starts_at`. Assignee filter works.

### 6a — `/field` route (part of this slice, not a separate project)

Responsive, thumb-sized targets. Five things only:

1. Today's schedule
2. Tap to navigate to the site address
3. Tap to call the customer
4. Upload site photos
5. Mark stage complete

Do not put the full CRM on a phone.

**Acceptance:** on a phone-sized viewport, today's appointments render and all
five actions work with a thumb.

---

## Slice 7 — Quotes
**Status:** done (2026-07-29) — line editor with cent-exact math (integer
cents, half-up commercial rounding; verified 47.5 × 87.99 case); totals at
the stored tax_rate; send freezes body_snapshot and the DB guard rejects
line-item deletes after draft (verified); accept stamps accepted_at and
offers the move to Won; branded print view (espresso/gold, Lora/Poppins) —
"PDF" is browser print-to-PDF per DECISIONS 021; render checked by code
walkthrough, worth one visual pass.

- Line item editor: description, qty, unit, unit price, auto amount
- Subtotal, HST at the stored `tax_rate`, total
- Statuses: draft → sent → accepted / declined / expired
- PDF render with branding — espresso/gold, Lora headings, Poppins body
- `body_snapshot` written on send
- Accepting a quote offers to move the job to `won`

**Acceptance:** build a quote, totals are correct to the cent, PDF renders with
correct branding, sending freezes the snapshot, accepting prompts the stage change.

---

## Slice 8 — Invoices and payments
**Status:** done (2026-07-29) — all money paths verified at the DB level:
convert_quote_to_invoice copies totals to the cent; back-to-back invoices got
consecutive numbers (minted inside the insert transaction, gapless); editing
a sent invoice or its line items fails at the database; partial e-transfer →
`partial` with correct balance, full payment → `paid` + paid_at, negative
refund → back to `partial`; void requires a reason and writes a reversal
activity; payment DELETE denied. Stripe webhook verified locally with real
HMAC signatures: bad sig 403, good sig records the payment end to end,
replay is idempotent (one row). Live Stripe needs STRIPE_SECRET_KEY /
STRIPE_WEBHOOK_SECRET / APP_URL in function secrets. CSV export + branded
print view with the HST number in place (HST value is a placeholder in
lib/business.ts — fill before first client invoice).

This is where a bug costs money instead of time. Slow down.

- `convert_quote_to_invoice()` — copies line items, links `quote_id`
- Standalone invoice creation for jobs without a quote
- Gapless numbering from the sequence function
- `tax_rate` stored per invoice, HST number on the rendered PDF
- Manual payment entry: e-transfer, cheque, cash — this is most of the volume
- Stripe payment link generation and webhook to record card payments
- Trigger maintains `invoices.amount_paid`; status moves to `partial` / `paid`
- Immutability trigger: once out of `draft`, invoice and line items reject `UPDATE`
- Void creates a reversal record, never deletes
- CSV export for the bookkeeper

**Acceptance:** convert a quote, numbers match to the cent. Record a partial
e-transfer, status becomes `partial`, balance is right. Attempting to edit a sent
invoice fails at the database level, not just in the UI. Stripe webhook records a
payment end to end. Two invoices created back to back have consecutive numbers.

---

## Slice 9 — Contracts and e-signature
**Status:** done (2026-07-29) — full flow verified against the local stack:
signing page serves the frozen body via the service-role edge function (no
anon RLS); signing captured name/email/IP/timestamp and produced a valid PDF
with all audit fields confirmed inside the PDF content streams; token reuse
→ 409, expired token rejected on GET and POST, tampering with a signed
contract blocked by the DB trigger; signed PDF also lands in the job's files
list. pdf-lib is function-scoped (DECISIONS 022). Note: production wants a
/sign/:token rewrite to the function URL in vercel.json at deploy time.

Highest risk. Everything else should be stable first.

- Contract template stored in the repo with a version string
- Generate from a job — merges contact, site address, scope, totals
- On send: write `body_snapshot`, mint a single-use `sign_token` with expiry
- Public signing page at `/sign/:token`, served by an Edge Function with the
  service role. **No anon RLS policy.**
- Signer enters name and email, draws a signature on canvas
- On submit: capture IP and timestamp, render an immutable PDF with the audit
  trail embedded, store it, set status to `signed`
- Job detail shows contract status and links the signed PDF

**Acceptance:** send a contract, open the link in an incognito window, sign it,
signed PDF contains the signature, signer name, email, IP, and timestamp. The
token cannot be reused. An expired token is rejected. Editing the template
afterwards does not change the already-signed document.

---

## Slice 10 — Comms: native voice and SMS (Twilio)
**Status:** code-complete (2026-07-29) — everything verifiable without live
Twilio credentials is verified locally: webhook signature validation (bad sig
→ 403, valid locally-computed HMAC accepted); inbound SMS auto-creates an
unverified contact, writes the implied CASL grant with the message as
evidence, lands on the newest open job, and replays are fully idempotent
(no duplicate message OR consent rows); STOP writes a withdrawn record and a
direct SQL outbound insert is blocked by the DB trigger; send-sms fails
closed (403) on withdrawn or absent consent BEFORE Twilio is called. Fixes
along the way: record_call/record_message needed explicit service_role
grants (DECISIONS 020 failure class). REMAINING for live sign-off: set
TWILIO_* secrets, point Twilio webhooks at the deployed functions, then run
the acceptance script (real call with announcement + recording playback,
real SMS round trip, delivery statuses). Bridging TwiML, announcement
whisper, recording copy-then-delete, and status callbacks are written and
awaiting that pass.

Schema already exists from Slice 0. This slice is edge functions and UI.
See DECISIONS 012/013. Softphone is **not** here — it is Slice 13.

- Dial-out bridging (default mode): click Call → Twilio rings my cell →
  answering dials the client, who sees the business number. Both legs recorded
  as one recording. A recorded-call announcement plays to the client before
  connect — hardcoded in the TwiML function, not disable-able from the UI
  (PIPEDA).
- Completion webhook writes the call via `record_call()`, copies the recording
  from Twilio into the private `comms` bucket, deletes the Twilio-hosted copy.
- Two-way SMS threaded per contact: on the job detail page and in a standalone
  inbox. Inbound webhook matches-or-creates a contact by E.164
  (`auto_created = true`) and appends to the thread.
- Outbound send fails **closed** on consent: no valid unexpired
  `consent_records` grant, no send. Inbound messages auto-create an implied
  grant with the message itself as evidence (CASL).
- STOP / UNSUBSCRIBE writes a withdrawn consent record; the DB trigger blocks
  future outbound sends to that number.
- Delivery status webhooks update message rows.
- All webhooks: Edge Functions, **Twilio signature validated** (403 otherwise),
  idempotent on provider SID, credentials only in function secrets — never in
  a `VITE_` variable.

**Acceptance:** click Call — my cell rings, answering connects the client, the
client hears the announcement, and the timeline shows the call with duration
and a playable recording. Send an SMS — it arrives, the thread shows delivered.
Reply from the client phone — it appears in the thread within seconds and on
the job timeline. Text STOP — the next outbound send is blocked at the DB
level (verified by direct SQL insert, not through the UI). A webhook with a
bad signature gets 403. Replaying the same webhook twice creates one row.

---

## Slice 11 — Reporting
**Status:** done (2026-07-29) — all four figures reconcile against manual SQL
on the seed data: pipeline by stage matched byte-for-byte across 11 stages;
win rate by lead_source (date-ranged, decided = won/lost, open excluded from
the rate) matched; invoiced-vs-collected by month and the referral
leaderboard matched. Loading/empty/error states per panel.

Four numbers, nothing more:

1. Pipeline value by stage, current
2. Win rate by `lead_source`, date-ranged — the number that decides Meta spend
3. Revenue by month: invoiced vs collected
4. Referral leaderboard: jobs and value by company

**Acceptance:** each figure reconciles against a manual query on the seed data.

---

## Slice 12 — Migration and cutover
**Status:** scripts ready (2026-07-29) — `scripts/import-trello.mjs` and
`scripts/import-invoicefly.mjs`, both dry-run by default with `--execute` to
write, refuse non-local URLs without an explicit override, dedupe contacts
by phone then name, and are idempotent on re-run (verified against synthetic
fixtures on the local stack; balances landed to the cent with correct
partial status). BLOCKED on real exports: edit STAGE_MAP to the real Trello
list names, run against the linked project, then run the one-month parallel
reconciliation before declaring done. Delete scripts/ after cutover.

- One-shot Trello CSV import script — contacts, jobs, stage mapping. Delete it after.
- Import open InvoiceFly invoices and outstanding balances
- **Run InvoiceFly in parallel for one full month.** Issue in both, reconcile
  totals weekly. Cut over only after a clean month.

**Acceptance:** every open Trello card exists as a job in the right stage. Every
outstanding InvoiceFly balance matches. One month of reconciliation with zero
discrepancies.

---

## Slice 13 — Browser softphone
**Status:** code-complete (2026-07-29) — behind VITE_FEATURE_SOFTPHONE (off:
component never renders, SDK never loads — it is a lazy chunk). voice-token
verified locally: staff-only (401 otherwise), mints a structurally correct
Twilio FPA JWT (HS256 signature verified against the API secret, voice
outgoing grant, 1h expiry). softphone-twiml reuses the bridging whisper /
recording / record_call() path — no parallel writes. REMAINING for live
sign-off: create the Twilio API key + TwiML App pointing at softphone-twiml,
set the four secrets, flip the flag, and complete a browser→phone call.

Secondary calling mode, behind a feature flag. Twilio Voice SDK
(`@twilio/voice-sdk` — needs its DECISIONS entry when added), a token-minting
edge function, TwiML App registration. Same recording, consent, and
`record_call()` logging path as bridging — no parallel write path.

**Acceptance:** with the flag on, a browser-to-phone call completes end to end
and lands on the timeline with a recording, identical to a bridged call. With
the flag off, nothing about it is reachable.

---

## Slice 14 — PWA
**Status:** code-complete (2026-07-29) — manifest (standalone, /field start
URL), placeholder branded icons (replace with real artwork), hand-written
service worker: cache is a speed layer only (API paths never cached,
network-first navigations, cache-first hashed assets); offline photo queue
in IndexedDB flushed on foreground/online (no Background Sync API);
push_subscriptions table + bell-toggle enrolment + send-push function
(web-push/VAPID) wired so an inbound SMS notifies staff devices. REMAINING
for live sign-off: generate VAPID keys (npx web-push generate-vapid-keys),
set VAPID_* secrets + VITE_VAPID_PUBLIC_KEY, deploy over HTTPS, then run
the install/push/offline-photo acceptance on real Android and iOS devices.

Manifest, service worker, icon set, installable. See DECISIONS 014.

- Android gets full push.
- iOS gets push only once added to the home screen (16.4+, non-EU; we are in
  Ontario). No auto-install prompt on iOS.
- No Background Sync API: queue photo uploads and flush on next foreground.
- iOS evicts cached data after disuse — the cache is a speed layer, never a
  source of truth.

**Acceptance:** installable on Android and iOS. Push received on Android and on
home-screen iOS. A photo uploaded in the field with no signal is queued and
lands on the job after the app next comes to the foreground with connectivity.

---

## After v1

Do not start any of these until slices 0–14 are done and the team has used the
system for a month. Reassess then — half of these will turn out not to matter.

- `/design` quoting tool integration — over the API, keyed on `quotes.design_quote_id` (separate projects, DECISIONS 017)
- Email from inside the app
- Automated follow-up reminders
- A customer-facing job status page

---

## Slice 15 — Job costing, expenses, monthly P&L
**Status:** done (2026-07-31) — expenses table (job cost vs overhead by
job_id, pre-tax amounts with HST tracked separately per DECISIONS 024);
Costs & profit card on job detail (invoiced pre-tax − costs = net + margin);
receipt upload to job-files; monthly accrual P&L on Reports (revenue → job
costs → gross → overhead → net + margin) with CSV export and inline
overhead entry. P&L reconciled to the cent against manual SQL on seed data;
expense insert/delete verified via REST.

---

## Slice 16 — Polish: global search, home dashboard, overdue indicators
**Status:** done (2026-07-31) — Cmd/Ctrl+K palette searching jobs, contacts
(name/phone/email), companies, and invoices with keyboard navigation; Home
dashboard as the landing page (today's schedule, overdue invoices with
balances, tasks due, leads going cold after 7 untouched days, open-pipeline
headline); overdue badges on the invoices list. All query shapes verified
against the REST API; every panel has loading/empty/error states.

---

## Slice 17 — Voice notes
**Status:** done (2026-07-31) — dictation via the browser-native Web Speech
API (no dependency, no key; mic hidden on unsupported browsers). Shared
NoteComposer with live interim transcript, editable before save, used by the
job activity timeline and a new contact-card Notes & activity timeline
(contact-level activities were already in the schema; the UI now exposes
them). Write path verified via REST; the mic itself needs a manual browser
pass (mic permission cannot be exercised headlessly).

---

## Slice 18 — Week time grid
**Status:** done (2026-07-31) — week view is now a 7:00–20:00 time grid:
events sized by duration and positioned by start time; dragging a block onto
any half-hour slot (same or another day) reschedules it to that exact slot,
with the end time shifted by the same delta. Month view keeps day-level
drops that preserve the time of day. Needs a manual drag feel-check.

---

## Slice 19 — Meta Messenger / Instagram integration
**Status:** code-complete (2026-07-31) — verified locally: hub.challenge
handshake, bad signature → 403, signed message event auto-creates an
unverified contact + identity and lands the DM on the timeline via
record_dm(), replay produces one row. Thread + inbox merge SMS and DMs with
channel badges; composer picks SMS/DM per contact; send-dm records outbound
and surfaces the 24-hour-window error. REMAINING for live sign-off: create
the Meta app, point the webhook at the deployed function with
META_VERIFY_TOKEN/META_APP_SECRET/META_PAGE_TOKEN secrets, subscribe the
page (pages_messaging needs Meta app review), send a real DM end to end.

---

## Slice 20 — Google Calendar link (ICS feed)
**Status:** done (2026-07-31) — token-gated iCalendar feed from the
calendar-feed function (last 30 days + next year of appointments, escaped
ICS, whole-team or per-assignee). "Link Google Calendar" on the Calendar
page fetches the tokened URL for signed-in staff with subscribe steps.
Verified: staff URL fetch, 401/403 auth matrix, valid VCALENDAR with all
seed events. Set ICS_FEED_TOKEN (and PUBLIC_SUPABASE_URL) in production
secrets; Google refreshes feeds every few hours (their cadence, not ours).

---

## Slice 21 — Board drag fix + customizable stages
**Status:** done (2026-07-31) — two root causes fixed for cards not moving:
(1) stale sessions after a db reset hit activities_user_id_fkey inside the
stage-change trigger, failing every move — the trigger now attributes only
when the profile exists, and the dev user has a fixed id so resets no longer
invalidate sessions; (2) drag handlers lacked dataTransfer.setData (Safari
won't start a drag without it), inner links hijacked the gesture, and drops
lacked preventDefault (Firefox navigates) — fixed on the board and both
calendar views. Stages: stage_settings table (rename/reorder/hide; enum keys
fixed so triggers and reporting are untouchable) with a Customize dialog on
the board; custom labels flow through badges and columns; hidden stages
still show while occupied. Verified via REST: defaults seeded, rename works,
client DELETE denied.

---

## Slice 22 — Tasks section, calendar deadlines, assignment
**Status:** done (2026-07-31) — standalone Tasks page (open/done/all,
assignee filter incl. "Mine", inline add with optional job + assignee + due
date, inline reassignment, complete/delete); task deadlines render as chips
on the month grid and an all-day row in the week grid (overdue in red), and
ride the ICS feed as all-day events so they land in Google Calendar too;
leads assignable inline from the jobs list assignee column (job detail
already had it). Create/assign/reassign and feed contents verified via REST.

---

## Slice 23 — Voice memos: saved audio + Whisper transcription
**Status:** done (2026-07-31, DECISIONS 026) — the composer mic now records
real audio (MediaRecorder), uploads it to the private bucket, attaches it to
the note (playable on job and contact timelines via signed URLs), and sends
it to OpenAI Whisper for quality transcription when OPENAI_API_KEY is set —
the browser live-draft is the fallback and the audio is kept regardless;
text stays editable before saving. Verified: upload path, note meta +
playback URL, transcribe auth matrix (401 unauthenticated, 400 non-voice
path, graceful 503 without the key). Set OPENAI_API_KEY in function secrets
to turn on Whisper; the recording flow itself needs one manual mic pass.

---

## Slice 24 — Last-contacted + Daily Brief agent
**Status:** done (2026-07-31, DECISIONS 027) — last-contact auto-touch
verified from outbound comms (sms trigger sets method+number); log_contact()
verified: writes the timeline activity, attributes the chosen user, and a
backdated manual log does not overwrite a newer automatic touch; Last
contact column on the jobs list (red when an early-stage lead sits >7 days)
and on the contact card with the Log contact dialog (method dropdown
pre-fills your number / business email / Business Suite, editable). Daily
Brief panel on Home calls the daily-brief function (Kimi default): verified
401 unauthenticated and graceful 503 without AI_API_KEY; live LLM output
needs the key. Each urgent item links to its job/contact and creates an
assigned task (due-dated → lands on the calendar + ICS feed) in one click.

---

## Slice 25 — Editable dropdown lists + Settings
**Status:** done (2026-07-31, DECISIONS 028) — generic option_items table;
lead-source fields on the new-job form, job details, and contact form are
now dropdowns with inline "+ Add new…"; Settings page manages every
registered list (rename, reorder, activate/deactivate, delete). Verified:
seeded list reads, insert path, duplicate rejected by unique constraint.

---

## Slice 26 — Invoice polish + contracts surfaced
**Status:** done (2026-07-31) — invoices list gets InvoiceFly-style summary
cards (outstanding / overdue / collected this month / drafts, reconciled
against SQL), search across number/client/job, and a one-click "+ Payment"
action per open invoice; new Contracts nav page lists every contract with
status, copy-signing-link, and signed-PDF actions — surfacing the Slice 9
e-sign flow (audit-trail PDF, single-use token, Electronic Commerce Act
compliance) that previously lived only on the job card.

---

## Slice 27 — Pipeline / Jobs split, board + list everywhere (GHL-style)
**Status:** done (2026-07-31) — one jobs table, two workspaces: Pipeline
(new → contacted → quoted → follow-up, with Won/Lost as terminal drop
columns) and Jobs (won → templated → fabrication → scheduled → installed →
closed). Each has a Board/List toggle sharing the same components
(StageBoard + JobsTable parameterized by stage subset), so drag behaviour,
inline assignment, filters, and stage customization work identically in
both. Closing a lead Won moves it to the Jobs workspace automatically
(verified: stage → won stamps won_at and switches workspace membership);
"New lead" on Pipeline starts at new, "New job" on Jobs starts at won for
repeat clients that skip the pipeline. /board redirects to /pipeline.

---

## Slice 28 — Clickable cards/rows; agent on gpt-4o-mini
**Status:** done (2026-07-31) — whole board cards and whole list rows
navigate to the job (drag still works; the inline assignee select stops
propagation); Daily Brief runs live on gpt-4o-mini in ~6s (kimi-k2.6 needs
temperature=1 and thinks too long for an interactive brief — the explicit
temperature was removed so either provider works; switch back anytime via
AI_API_BASE/AI_MODEL). Contract generation verified working at the API — the
"not generating" symptom was the long-lived dev server's broken HMR graph
after many branch switches; server restarted (now on :5173).

---

## Slice 29 — Team roles + role-aware Daily Brief
**Status:** done (2026-07-31, DECISIONS 029) — Settings → Team edits each
member's name, company role (editable list), and free-text responsibilities;
the brief personalizes to the caller (header shows who it's for), categorizes
items, and routes cross-role signals by author. Live-verified end to end:
salesperson's porcelain-mitre uncertainty became the production manager's
P1 with correct attribution.

---

## Slice 30 — AI credits
**Status:** done (2026-07-31, DECISIONS 030) — live-verified end to end:
a real brief logged with token counts (1901 in / 713 out on gpt-4o-mini),
the meter travels in every response ("N credits left" on the brief panel),
dropping the cap produced a real 429 with a helpful message, and an admin
+25 grant unblocked immediately. Per-person usage bars + allowance editing
+ one-click grants in Settings → AI usage.

---

## Slice 31 — Settings hub + employee profile
**Status:** done (2026-07-31) — Settings is now tabbed: Business (identity,
HST number, default tax rate — stored in business_settings, admin-writable,
rendered on quote/invoice prints with the hardcoded file as fallback only),
Team, AI usage, Dropdown lists, and Integrations (live green/grey health for
AI, Whisper, Twilio, softphone, Stripe, Meta, calendar feed, push — key
presence only, never values). Top-right avatar menu → /profile: employee
card (name + direct phone self-editable with E.164 enforcement; company role
and responsibilities shown read-only for staff — set by an admin in
Settings → Team), my assigned jobs with last-contact recency, my open tasks,
my AI meter. Log-contact defaults now prefer your own profile phone.
Verified via REST: HST update, phone CHECK rejection, integration status.

---

## Slice 32 — Security hardening + backups
**Status:** done (2026-07-31, DECISIONS 031) — full staff-vs-admin matrix
verified live: staff see 0 overhead rows (admins 5) while keeping job costs;
self-promotion blocked by trigger with own name/phone edits still allowed;
backup function 403s staff; admin run dumped 27 tables / 97 rows / 34 KB to
the private bucket with a working signed download, Google Drive copy
gracefully skipped until GDRIVE_* secrets exist. P&L panel and
Business/Integrations/Security tabs admin-only in UI on top of the DB
enforcement.

---

## Slice 33 — Multi-tenant accounts, signup, agency view
**Status:** done (2026-07-31, DECISIONS 032) — public signup (create a
business and become its admin, or wait in the lobby until an admin adds
your email in Settings → Team); complete tenant isolation verified live
both ways with a second business (data, profiles, counters); platform-admin
Agency page + header business switcher (GHL-style); Sarah/Jake test flow:
signup → found business → job EI-2026-0001 on a fresh counter → lobby user
sees nothing → admin add-by-email grants instantly → staff cannot invite →
non-member switch rejected.

---

## Slice 34 — Sara, the conversational assistant
**Status:** done (2026-07-31) — the AI assistant is named Sara. Floating ✨
chat available on every page: multi-turn, role-aware, grounded in the live
business snapshot (open jobs + authored notes, week of appointments,
overdue balances, open tasks), tenant-scoped, credit-metered (sara-chat
usage rows verified), with suggestion chips and job numbers in her replies
linkified to the job cards. The Daily Brief is now Sara's brief, sharing
her snapshot module. Live-verified multi-turn: "what should I do today" →
correct follow-up + consultation from seed data; risk follow-up question
answered in context. She is advisory-only — she never writes data.

---

## Slice 35 — Sara's face
**Status:** done (2026-07-31) — hand-drawn SVG bot mascot, zero
dependencies: bobbing/blinking with a glowing antenna when idle, darting
eyes while she reads the books, beaming + waving when she answers (and in
the chat empty state); one-time greeting bubble invites new users to say
hi (localStorage-dismissed). Lives on the floating button, the chat
header, the thinking indicator, and the Daily Brief title. Needs a
human eye for the cuteness check.

---

## Slice 36 — Sara schedules tasks, conservatively
**Status:** done (2026-07-31) — Sara's first write ability: create_task via
tool-calling. Double-guarded: the prompt feeds her everyone's 7-day task
load and orders the fewest tasks possible / realistic dates / spread the
week / suggest delegation when someone's loaded; the server caps 3 per
message, validates assignees against active business members, clamps due
dates (today…+60d), resolves job numbers within the tenant, and attributes
business_id explicitly. Chat shows "✓ Task on calendar" chips and
invalidates task/calendar caches. Live-verified: one correct task created
with the job resolved from conversational context; a 10-task over-schedule
request was refused with a load-based explanation (0 created).

---

## Slice 37 — Time-boxed tasks, hero dashboard, session self-heal
**Status:** done (2026-08-01) — tasks carry estimated_minutes (5–480 for
humans; Sara is clamped 5–120, default 15, prompted never to pad — a call
is 10-15 min); minutes show on task rows and Sara's confirmation chips.
Live-verified: she refused to duplicate an existing follow-up task AND
refused to overload a day that already had an install, instead of blindly
booking a padded block. Dashboard: gradient hero where Sara greets you by
first name with a time-of-day hello and a one-line day summary (appts /
overdue / tasks due), plus glass stat tiles — no AI credits spent on page
load. Auth self-heal: a locally stored session that the server no longer
recognizes (e.g. after a dev db reset) is validated once on load and
cleared to the login page instead of erroring app-wide; root cause of
today's "not authenticated" (auth/db container migration mismatch) fixed
by stack restart.

---

## Slice 38 — Openable, fully editable tasks
**Status:** done (2026-08-01) — tasks open into a detail dialog from the
Tasks page and job cards: notes/instructions (new description column,
📝 indicator on rows), due date, assignee, time budget, linked job,
complete toggle, delete. Sara now writes 1-3 sentence instructions into
tasks she creates. Edit paths verified via REST.

---

## Slice 39 — Lead cards, custom columns, live lead sheets
**Status:** done (2026-08-02, DECISIONS 033) — pipeline opens leads at
/leads/:id (own card: ← Pipeline, pipeline-stage selector, notes timeline +
comms + quotes + tasks; costing stays jobs-only); Jobs still opens
/jobs/:id. "+ Add column" in Customize stages unhides one of six spare
stages with a custom name and a Pipeline/Jobs placement selector. ⚡ Lead
sources on the Pipeline connects Meta/Google-form Google Sheets: AI column
mapping (verified against cryptic headers), raw-first ingestion, row-hash
dedupe, E.164 normalization, contact match-or-create, form message as a
note, auto-sync on open + every 3 min. All verified live end to end.

---

## Slice 40 — Bulk select/delete + full sheet notes
**Status:** done (2026-08-02) — list views (Pipeline and Jobs) get row
checkboxes, select-all, and a bulk Delete bar (soft-delete per the delete
matrix — recoverable, never destroyed; confirm dialog says so). Sheet
ingestion now captures EVERY note-like column: the AI classifies each
column as lead context vs metadata; verified live — a 9-column Meta export
produced map {name:2, phone:3, email:4, notes:[5,6,7,8]} excluding
timestamp/form-id, and the lead's note reads "Lead form details:" with
service/budget/timeline/how-heard each labeled by its question. Cached maps
from before this slice auto-remap on next sync.

---

## Slice 41 — Lead card info/notes, sheet stages, per-board columns, owner filters, lead emails
**Status:** done (2026-08-02) — REAL DATA IS NOW LIVE IN THE LOCAL DB: the
owner connected their actual "Meta campaign 1" sheet (196 leads). Lead card
shows a Lead info panel (contact/source/arrival + every form answer from
the raw inbound record) with Notes directly beneath; sheet leads title by
CUSTOMER NAME and land in the stage their sheet says (AI maps sheet status
values to this business's stages; cached per sheet); "Re-map" per sheet
re-derives titles/stages for leads imported before a mapping improvement —
ran against the real sheet: 196/196 updated, stages distributed
lost 84 / new 74 / contacted 40 (AI translated "Qualified/In progress"→
contacted, "Missing info/Not qualified"→lost). Customize-stages is now
per-board (pipeline edits pipeline columns, jobs edits production; "+ Add
column" assigns to the current board; won→Jobs handoff unchanged). Owner
filters: board gains All/Mine/Unassigned/person; lists gain "Mine". New-
lead email digest via Resend (DECISIONS 034; needs RESEND_API_KEY).
NOTE: `npm run db:reset` NOW DESTROYS REAL BUSINESS DATA — do not run it
casually; the guard scripts remain local-only but the local DB is no longer
disposable.

---

## Slice 42 — Agency: add clients
**Status:** done (2026-08-02) — "+ Add client" on the Agency view (platform
admins only): creates a fully seeded client workspace (17 stages, default
lists, settings row) via create_client_business(); optionally names the
client's first admin by email (helpful error when the account doesn't exist
yet); the platform admin joins as admin WITHOUT their own active workspace
switching. Verified live: seeding, unchanged active business, unknown-email
error; guard is is_platform_admin(). Applied with `supabase migration up`
— no reset (real data preserved).

---

## Slice 43 — Contract on the invoice
**Status:** done (2026-08-02) — invoices carry an optional contract
reference: a Contract row on the invoice editor (draft AND issued — it's
metadata, deliberately outside the immutability whitelist, verified live:
attach to a sent invoice succeeded while a total edit stayed blocked)
selects from the job's contracts, one-click signed-PDF view, and the
printed invoice footers "Signed contract on file (date, signer)". Applied
via migration up, no reset.

---

## Slice 44 — Email invites
**Status:** done (2026-08-02) — adding a person by email (Settings → Team,
or the client-admin field in Agency → Add client) now works for people who
haven't signed up: existing accounts are added instantly; new people get a
single-use 14-day invite link that completes signup INTO the right business
with the right role (signup page hides the create/join choice when a token
is present). Emailed via Resend when configured; the link is ALWAYS
returned with a copy button so the flow works before email is set up.
Live-verified full loop: invite → link → signup+accept → member sees the
business (212 jobs) → token reuse rejected. Fix along the way: ON CONFLICT
needs a plain unique constraint, not an expression index.

---

## Slice 45 — New-lead button + multiple pipelines
**Status:** done (2026-08-02, DECISIONS 035) — "+ New lead" on the Pipeline
header (both views, lands in the open pipeline); pipeline TABS with
"+ New pipeline" (admin — seeds its own stage set); boards, lists,
customize-stages, and add-column are all per-pipeline; Won from any
pipeline flows to Jobs unchanged. Verified live: second pipeline seeded 11
stage rows, per-pipeline label isolation ("Inquiry" in one, "New" in the
other), lead created with pipeline attribution. Applied via migration up —
real data intact.

---

## Slice 46 — Agentic Sara with a human gate + undo
**Status:** done (2026-08-02, DECISIONS 036) — admins can ask Sara for bulk
changes; she can only STAGE them. Confirmation card requires typing the
exact phrase (e.g. "MOVE 2") + Execute; 24h one-click Undo; cancel/expiry;
admin+business validated server-side. Full cycle live-verified: staging
changed nothing, wrong phrase 400, execute moved 2, undo restored, replay
409. Incident note: pre-gate design let the model self-confirm and it
mass-moved real leads — restored via activities audit log; the gate now
makes that impossible. Also: sheet sync batched (timeout → <1s, duplicate
rows in sheets handled), sara-chat hardened with tool try/catch + error
envelope + toolTrace.
