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
**Status:** not started

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
**Status:** not started

Four numbers, nothing more:

1. Pipeline value by stage, current
2. Win rate by `lead_source`, date-ranged — the number that decides Meta spend
3. Revenue by month: invoiced vs collected
4. Referral leaderboard: jobs and value by company

**Acceptance:** each figure reconciles against a manual query on the seed data.

---

## Slice 12 — Migration and cutover
**Status:** not started

- One-shot Trello CSV import script — contacts, jobs, stage mapping. Delete it after.
- Import open InvoiceFly invoices and outstanding balances
- **Run InvoiceFly in parallel for one full month.** Issue in both, reconcile
  totals weekly. Cut over only after a clean month.

**Acceptance:** every open Trello card exists as a job in the right stage. Every
outstanding InvoiceFly balance matches. One month of reconciliation with zero
discrepancies.

---

## Slice 13 — Browser softphone
**Status:** not started

Secondary calling mode, behind a feature flag. Twilio Voice SDK
(`@twilio/voice-sdk` — needs its DECISIONS entry when added), a token-minting
edge function, TwiML App registration. Same recording, consent, and
`record_call()` logging path as bridging — no parallel write path.

**Acceptance:** with the flag on, a browser-to-phone call completes end to end
and lands on the timeline with a recording, identical to a bridged call. With
the flag off, nothing about it is reachable.

---

## Slice 14 — PWA
**Status:** not started

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
