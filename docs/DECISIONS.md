# Decisions

Append-only. Newest at the bottom. One entry per decision, kept short.

Purpose: stop Claude Code from relitigating settled questions in a later session,
and stop us from forgetting why something looks odd.

Format:

```
## NNN — Title
Date · Status: accepted | superseded by NNN
**Context** — what forced the decision
**Decision** — what we chose
**Consequence** — what this costs us
```

---

## 001 — Build internally rather than buy
2026-07 · accepted

**Context** — Currently on InvoiceFly for invoicing and Trello for job tracking.
Trello cannot express a relational model: one contact with three jobs, a quote, a
deposit, and two install dates is not a card. Off-the-shelf options (Jobber,
Housecall Pro, Clientility) are job-shaped but do not know about slabs, templating,
or our quoting tool.

**Decision** — Build an internal CRM on the existing Vite/React/TS + Supabase stack.
Internal use only. Not a product.

**Consequence** — We own maintenance forever. Justified only because it shares a
Supabase project with the `/design` quoting tool, which is the actual differentiator.
If that integration never happens, this decision was wrong.

---

## 002 — Same Supabase project as `/design`
2026-07 · superseded by 017

**Decision** — CRM tables live in the `public` schema of the existing project.

**Consequence** — `quotes.design_quote_id` becomes a real foreign key and the
quote-to-job handoff needs no integration layer. Cost: one schema, shared migration
history, and more care needed around RLS.

---

## 003 — Quotes and invoices stay separate tables
2026-07 · accepted

**Context** — They look nearly identical. Merging into one `documents` table with a
`type` column is tempting.

**Decision** — Separate tables, separate line item tables, plus a
`convert_quote_to_invoice()` function.

**Consequence** — About forty lines of apparent duplication. Worth it: quotes expire
and invoices accrue, they have different required fields and different state
machines, and invoices need immutability and gapless numbering that quotes do not.
Merging them is the Wrong Abstraction failure mode.

---

## 004 — `appointments` table instead of date columns on jobs
2026-07 · accepted

**Context** — First draft had `template_date` and `install_date` on `jobs`.

**Decision** — Neither. A job has many scheduled events: consultation, template,
install day one, install day two, service callback.

**Consequence** — Calendar reads from one table. Crew assignment comes free. Cost:
"the install date" is now a query, not a column — put it in a view.

---

## 005 — `tax_rate` stored per invoice
2026-07 · accepted

**Decision** — `invoices.tax_rate numeric(5,4)`, populated at creation. Ontario HST
is `0.1300` today.

**Consequence** — A rate change does not silently rewrite history. Every invoice
renders with the rate it was issued at. Never read the rate from a constant.

---

## 006 — Documents are immutable once sent
2026-07 · accepted

**Decision** — Once an invoice leaves `draft` or a contract is signed, `UPDATE` is
blocked by a database trigger. Corrections are a void plus a new document.

**Consequence** — Slightly more friction for typo fixes. In exchange, the signed
contract and the issued invoice are defensible in a dispute, which is the entire
point of storing them.

---

## 007 — Build e-signature rather than integrate DocuSign
2026-07 · accepted

**Context** — Only our own contract template needs signing. Under Ontario's
*Electronic Commerce Act, 2000* an electronic signature is enforceable; what makes
it defensible is the audit trail.

**Decision** — Build it: tokenized signing link, canvas signature, capture verified
email + timestamp + IP, render an immutable PDF with the audit record embedded.

**Consequence** — Two to three days of work versus a per-seat subscription and an
integration. If we ever need counter-signing, multiple signers, or witnessed
documents, revisit — Documenso is the fallback.

---

## 008 — Public pages go through Edge Functions, never anon RLS
2026-07 · accepted

**Context** — The signing page and the payment page must work without login.

**Decision** — Both served by Supabase Edge Functions using the service role, gated
by a single-use expiring token. No anonymous RLS policy on `contracts`, `invoices`,
or `jobs`.

**Consequence** — More code than a public policy would need. The alternative is a
policy that leaks every customer's job data to anyone who finds the endpoint.

---

## 009 — No per-user permissions in v1
2026-07 · accepted

**Decision** — All authenticated staff can read and write everything. `role` exists
on `profiles` but is unused.

**Consequence** — Revisit if the team grows past roughly five people or if
subcontractors ever need access.

---

## 010 — Gapless document numbers from a counters table, not sequences
2026-07 · accepted

**Context** — SCHEMA.md originally said "a Postgres sequence per year," but
sequences do not roll back — a failed transaction burns a value and leaves a
gap, and invoice numbers must be gapless.

**Decision** — `document_counters (prefix, year, last_value)` incremented under
a row-level lock inside `next_document_number(prefix)`, returning
`{prefix}-{year}-{NNNN}`. Applied to jobs, quotes, and invoices for one code
path; only invoices strictly need it.

**Consequence** — Brief lock contention on concurrent same-prefix creation.
Negligible at our volume.

---

## 011 — Explicit per-table delete policy
2026-07 · accepted

**Decision** — Three buckets, enforced in the database. Soft delete only:
companies, contacts, jobs. Hard delete permitted: tasks, appointments, files,
and line items while the parent document is `draft`. Permanently denied:
activities, calls, messages, payments, quotes, invoices, contracts,
consent_records, inbound_leads. Append-only tables (`activities`,
`consent_records`) share one guard trigger — one pattern, not exceptions.

**Consequence** — Junk leaves through the right door (discard, void, soft
delete) and legal/financial records cannot vanish. Cost: no quick cleanup of
a mistaken entry; corrections are explicit.

---

## 012 — Native voice and SMS in v1 (Slice 10), built on Twilio
2026-07 · accepted · supersedes the "no SMS from the app" scope line

**Context** — The workflow lives on calls and texts; a CRM that cannot show
them on the job timeline is missing the record that matters. CASL and PIPEDA
compliance must be designed in, not bolted on.

**Decision** — Twilio. Comms rows live in dedicated `calls` / `messages`
tables (not shoehorned into `activities`), each one-to-one with a timeline
activity written atomically by `record_call()` / `record_message()`.
`consent_records` is append-only and number-scoped; outbound send fails
closed without a valid grant; STOP is enforced by a database trigger.
Webhooks are signature-validated, idempotent Edge Functions; recordings are
copied into our private `comms` bucket. Email remains out of scope.

**Consequence** — A telephony vendor dependency with per-usage cost, and an
edge-function surface to maintain. The browser softphone is deferred to its
own slice (13).

---

## 013 — Dial-out bridging is the default calling mode
2026-07 · accepted

**Context** — Calling must work identically from a PWA, a plain browser tab,
or a native shell. A WebRTC softphone inside an iOS PWA is unreliable.

**Decision** — Twilio rings the owner's cell first; answering bridges the
client, who sees the business number. The recorded-call announcement plays to
the client before connect and cannot be disabled from the UI.

**Consequence** — Two call legs per call (cost), and the owner's cell is a
hard dependency for outbound calls. The softphone (Slice 13) is an
alternative, never the default.

---

## 014 — PWA before native; Capacitor as the fallback
2026-07 · accepted

**Context** — Field use needs the app on a phone. React Native means a second
codebase with no payoff at our scale.

**Decision** — PWA (Slice 14): manifest, service worker, installable; full
push on Android; iOS push only from the home screen (16.4+). No Background
Sync API — queue uploads, flush on next foreground. The cache is a speed
layer, never a source of truth. Capacitor is the fallback if App Store
presence is ever required.

**Consequence** — iOS limitations are accepted as-is. No App Store presence
in v1, and per-client white-labelled binaries stay out of scope permanently
(Apple 4.2.6 / 4.3(a)).

---

## 015 — Lead ingestion stores the raw payload first, parses second
2026-07 · accepted

**Context** — A first `inbound_leads` draft made parsed fields primary and the
raw payload secondary, with an E.164 CHECK on the parsed phone. Third parties
send phones in arbitrary formats; that CHECK would reject the INSERT and lose
the lead — the exact failure the table exists to prevent.

**Decision** — `raw_payload jsonb not null` is stored before any parsing;
`parsed_*` columns are best-effort; `parsed_phone` carries **no** E.164 CHECK;
a parse failure writes `parse_error` instead of throwing; the ingest endpoint
returns 200 once the row is stored. E.164 normalisation happens at conversion,
when writing `contacts.phone` (which is constrained).

**Consequence** — Malformed leads sit visibly with a `parse_error` instead of
vanishing, and conversion carries the normalisation burden. Zapier never
retry-loops on a lead we already have.

---

## 016 — No destructive commands against the linked project (amends 002)
2026-07 · accepted

**Context** — Decision 002 put the CRM in the same Supabase project as the
`/design` quoting tool, which has live paying customers. `supabase db reset
--linked` (or any drop/truncate against the linked project) would destroy it.

**Decision** — Resets run only against the local Docker instance. The only
command ever run against the linked project is `supabase db push`. The
`db:reset` npm script targets local only, and no script that can reset the
linked project may be added. Recorded in bold at the top of CLAUDE.md's
non-negotiables.

**Consequence** — Verifying "migration runs clean on a fresh DB" requires the
local stack (Docker). Slightly slower loop; `/design`'s data is never one
mistyped flag away from deletion.

---

## 017 — Own Supabase project; not shared with `/design` (supersedes 002)
2026-07 · accepted

**Context** — `/design` is not live, the two systems have independent
lifecycles, and a shared project made a linked reset capable of destroying
another application.

**Decision** — The CRM gets its own Supabase project. `quotes.design_quote_id`
stays as a plain nullable uuid with no foreign key; any cross-referencing
happens over the API when `/design` ships.

**Consequence** — `design_quote_id` is an unenforced reference and linkage is
an API call — a small cost against full blast-radius isolation. The local-only
reset discipline (016) stands: post-cutover, the linked project holds live
financial records.

---

## 018 — Files undeletable until Slice 3; no SQL deletes of Storage objects
2026-07 · accepted

**Context** — The delete matrix originally required file deletion to remove
the Storage object in the same RPC. Supabase now blocks SQL deletes on
`storage.objects` with its own trigger. An undocumented GUC escape hatch
exists (`storage.allow_delete_query`) but was rejected: deleting only the
database row never touches the physical backing object, which would sit
orphaned and invisible forever — the exact failure the rule exists to
prevent, moved somewhere nobody can see it.

**Decision** — Slice 0 ships only `files_delete_guard()`: files cannot be
deleted by any role. Slice 3 ships the real path in its own migration: an
edge function removes the object via the Storage API **first**, then a
service-role RPC deletes the row, authorising the guard via its
transaction-local flag. Object-first ordering because a visible dangling row
is recoverable and an invisible orphaned object is not.

**Consequence** — No file deletion of any kind until Slice 3 — safe, since
nothing can create a file before then either. The guard's authorisation flag
ships in Slice 0 so the Slice 3 RPC needs no schema change to the guard.

---

## 019 — Client companion packages: `@supabase/supabase-js`, `@hookform/resolvers`
2026-07 · accepted

**Context** — Slice 1 needs the browser client for the already-chosen Supabase
stack, and the standard bridge between react-hook-form and zod (both already
in the stack table).

**Decision** — Add `@supabase/supabase-js` (the only supported JS client for
Supabase Auth/Postgrest/Storage) and `@hookform/resolvers` (first-party
react-hook-form resolver package; the zod resolver lives there). Neither is a
new stack choice — they are the runtime halves of choices already made.

**Consequence** — Two more permanent dependencies, both maintained by the
vendors of stack components we already committed to.

---

## 020 — Table privileges are explicit; default grants are not trusted
2026-07 · accepted

**Context** — The Slice 0 migration relied on Supabase's default privileges to
give `authenticated` DML on new tables and revoked back what should not be
allowed. On the current stack the defaults do not apply to migration-created
tables at all: every table came up with no SELECT/INSERT/UPDATE/DELETE for
anon, authenticated, or service_role, and every API request failed with
"permission denied" before RLS was consulted. Found in Slice 1's first
end-to-end auth test.

**Decision** — `20260729000001_explicit_grants.sql` grants privileges
explicitly, mirroring the delete-policy matrix in docs/SCHEMA.md. From now on
every migration that creates a table also grants its privileges explicitly in
the same migration — the default-privilege behaviour of the platform is never
assumed. anon gets no grants, ever. service_role gets full DML; the guard
triggers (which fire for the service role too) remain the enforcement for
immutable tables.

**Consequence** — Grant statements are boilerplate in every table migration,
in exchange for a permission model that is readable in one file and immune to
platform changes in default privileges. The revoke-then-narrow dance for
calls/messages in Slice 0 is superseded by grant-only statements.

---

## 021 — Document PDFs are print-styled HTML via the browser
2026-07 · accepted

**Context** — Slice 7 needs branded quote PDFs (and Slice 8 invoices, Slice 9
signed contracts). A JS PDF library is a heavy permanent dependency, and we
do not email documents from the app (out of scope), so a download button that
opens the browser's print-to-PDF on a print-styled route covers the workflow.

**Decision** — `/quotes/:id/print` (and later invoice equivalents) are
chrome-free routes styled with the brand (espresso `#3b2a20` / gold
`#b08d3f`, Lora headings, Poppins body, fonts loaded only on those routes).
"PDF render" = browser print-to-PDF. Exception: the Slice 9 signed-contract
PDF is generated server-side in the signing edge function because it must be
produced without a staff browser in the loop.

**Consequence** — Zero new dependencies now; pixel-perfect control lives in
one stylesheet per document. If the after-v1 email feature ever lands,
server-side rendering will need a real PDF pipeline then.

---

## 022 — `pdf-lib` in the signing edge function
2026-07 · accepted

**Context** — The signed-contract PDF must be produced server-side at the
moment of signing, with the audit trail embedded, without a staff browser in
the loop — print-styled HTML (021) cannot do that.

**Decision** — The `sign-contract` edge function uses `pdf-lib` (pure JS, no
native deps, runs in Deno) to compose the signed document: full contract
text, signature image, signer name/email, IP, and UTC timestamp. It is a
function-level dependency only — the web app does not ship it.

**Consequence** — One dependency scoped to one edge function. The visual
fidelity is deliberately plain (typewritten agreement, not the branded
quote look) — what matters here is evidentiary completeness, not styling.

---

## 023 — `@twilio/voice-sdk` for the feature-flagged browser softphone
2026-07 · accepted

**Context** — Slice 13 adds browser-to-phone calling as a secondary mode
behind `VITE_FEATURE_SOFTPHONE`. Twilio's Voice SDK is the only supported
way to run a WebRTC leg against Twilio.

**Decision** — Add `@twilio/voice-sdk`, lazy-imported only when the flag is
on, so the bundle cost is zero for the default build. Tokens are minted by
the `voice-token` edge function (API key/secret live in function secrets);
the TwiML App points at `softphone-twiml`, which reuses the same
announcement whisper, recording callback, and `record_call()` path as
dial-out bridging — no parallel write path.

**Consequence** — One flag-gated dependency. Removing the softphone later is
deleting one component, one hook, two functions, and this entry.

---

## 024 — Job costing and P&L are in scope; books of record are not
2026-07 · accepted

**Context** — The owner needs per-job profitability (materials, subcontractor
payments, disposal…), overhead tracking, and a monthly P&L. The out-of-scope
rule says we do not replace accounting software.

**Decision** — One `expenses` table: `job_id` set → job cost, null →
overhead. Amounts are PRE-TAX with `hst_amount` tracked separately (an input
tax credit is not a cost); every profit figure in the app is pre-tax
(invoice `subtotal`, never `total`). Receipts upload to the job-files
bucket. Expenses are management records — editable and hard-deletable,
unlike payments/invoices. The Reports P&L is accrual (revenue by
`issue_date`, costs by `incurred_at`) with CSV export for the bookkeeper.

**Consequence** — The CRM answers "what did we actually make on this job /
this month" the moment a receipt is entered, while QuickBooks remains the
book of record for the CRA. If the two ever disagree, QuickBooks wins.

---

## 025 — Meta DMs get their own tables, keyed on PSID
2026-07 · accepted

**Context** — Messenger/Instagram enquiries should thread into the same
contact card as SMS. But Meta identity is a page-scoped user ID (PSID), not
a phone number, and the messages table CHECK-enforces E.164 on its number
columns for threading integrity.

**Decision** — `channel_identities` (platform + external_id → contact,
staff-relinkable) and `dm_messages` (service-role writes via the atomic,
idempotent `record_dm()`, mirroring `record_message()`). Inbound webhook
`meta-webhook` validates X-Hub-Signature-256 (403 otherwise) and handles the
hub.challenge handshake. Outbound `send-dm` uses the page token and surfaces
Meta's 24-hour reply-window rejections to the UI. The thread view and inbox
merge SMS + DMs sorted by time, with channel badges.

**Consequence** — No E.164 constraint was weakened and SMS threading is
untouched. Live wiring requires a Meta app (webhook URL + verify token, app
secret, page token with pages_messaging — subject to Meta app review).

---

## 026 — Voice memos keep the audio; Whisper transcribes when configured
2026-07 · accepted

**Context** — Browser-native dictation quality disappointed. The recording
itself is the reliable artifact; transcription is an enhancement.

**Decision** — The note composer records real audio (MediaRecorder → private
job-files bucket under voice-notes/, attached to the activity as
meta.audio_path, playable on timelines). The `transcribe` edge function runs
it through OpenAI Whisper when OPENAI_API_KEY is set in function secrets;
without the key the browser's live draft stands and the audio is still
attached. Text remains editable before saving in all cases.

**Consequence** — One optional secret; no new client dependency. Whisper
cost is ~fractions of a cent per note. If Whisper is down or unconfigured,
nothing is lost — the recording is always saved first.

---

## 027 — Last-contacted tracking + the Daily Brief agent (Kimi by default)
2026-07 · accepted

**Context** — Leads die from silence. The owner wants per-contact
last-touched visibility and an agent that reads everything (stages, notes,
transcripts, recency, installs, overdue invoices) and says who to contact
today.

**Decision** — contacts carry denormalised last_contacted_* fields updated
by triggers on every outbound sms/call/DM, plus log_contact() for
out-of-band touches (who / method / from-detail; backdated logs never beat
newer touches). The daily-brief edge function snapshots the operation and
asks an OpenAI-compatible LLM for a prioritised outreach plan returned as
strict JSON; each recommendation becomes an assigned, calendared task in one
click. Default provider is Moonshot Kimi K2 (AI_API_KEY; AI_API_BASE /
AI_MODEL override) — materially cheaper than GPT-4-class for this daily,
low-stakes workload. Transcription stays Whisper (Moonshot has no STT API)
but TRANSCRIBE_API_BASE/KEY/MODEL now allow any compatible host (e.g. Groq).

**Consequence** — The agent is advisory only: it writes nothing without a
click, so a hallucinated priority costs a glance, not data. Provider swap is
an env change. Without AI_API_KEY the panel degrades to a one-line hint.
