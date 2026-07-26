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
2026-07 · accepted

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
