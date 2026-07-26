# Schema

Source of truth for the data model. If code and this document disagree, this
document is wrong — fix it in the same commit.

Shared Supabase project with the `/design` quoting tool. All tables below are new.

---

## Enums

```sql
create type company_type   as enum ('builder','designer','general_contractor','supplier','other');
create type job_stage      as enum ('new','contacted','quoted','follow_up','won',
                                    'templated','fabrication','scheduled','installed',
                                    'closed','lost');
create type quote_status   as enum ('draft','sent','accepted','declined','expired');
create type invoice_status as enum ('draft','sent','partial','paid','void');
create type payment_kind   as enum ('deposit','progress','final','refund');
create type payment_method as enum ('etransfer','cheque','cash','card','other');
create type activity_kind  as enum ('note','call','sms','email','meeting','stage_change','system');
create type appt_kind      as enum ('consultation','template','install','service','pickup');
create type contract_status as enum ('draft','sent','signed','declined','void');
create type file_kind      as enum ('measure','drawing','slab_photo','site_photo',
                                    'contract','invoice','other');
create type user_role      as enum ('admin','staff');
create type call_direction  as enum ('inbound','outbound');
create type call_outcome    as enum ('connected','no_answer','voicemail','busy','failed');
create type message_status  as enum ('queued','sent','delivered','failed','received');
create type consent_channel as enum ('sms','call_recording');
create type consent_status  as enum ('express','implied','withdrawn');
create type lead_provider   as enum ('website','meta','google_ads','google_lsa',
                                     'zapier','manual','other');
```

Adding a value is a migration. Never store one of these as `text`.

---

## Phone numbers

Every phone column stores E.164 (`+14165551234`). Enforced by a CHECK
constraint on every phone column; normalised on write; formatted for display
only in `lib/format.ts`. Inbound call and SMS webhooks match contacts by exact
number — one badly formatted phone breaks threading for that person, so
`contacts.phone` is indexed for the lookup. Applies to `companies.phone`,
`contacts.phone`, `calls.from_number` / `to_number`, `messages.from_number` /
`to_number`, and `consent_records.phone_number`.

`inbound_leads.parsed_phone` is **deliberately exempt** — third parties send
phones in arbitrary formats, and a CHECK there would reject the INSERT and
lose the lead. Normalisation happens at conversion time, when writing
`contacts.phone`, which is constrained.

---

## Tables

### profiles
Mirrors `auth.users`. Created by trigger on signup.

| column | type | notes |
|---|---|---|
| id | uuid PK | references `auth.users(id)` on delete cascade |
| full_name | text | |
| role | user_role | default `staff` |

### companies
Trade accounts and referral sources. **This is the referral-tracking backbone** —
a designer is not a customer, they are a source of many jobs.

| column | type | notes |
|---|---|---|
| name | text not null | |
| type | company_type not null | |
| phone, email, address | text | |
| notes | text | |
| deleted_at | timestamptz | soft delete |

### contacts
The person. May or may not belong to a company.

| column | type | notes |
|---|---|---|
| company_id | uuid FK → companies | nullable, on delete set null |
| full_name | text not null | |
| phone, email | text | phone is E.164, CHECK-enforced, indexed — inbound comms match on it |
| address | text | billing/home address |
| lead_source | text | how this *person* first arrived |
| auto_created | boolean not null default false | true when created by an inbound comms webhook; contact lists filter these out by default until a human verifies them |
| notes | text | |
| deleted_at | timestamptz | |

### jobs
The spine. Everything hangs off a job.

| column | type | notes |
|---|---|---|
| contact_id | uuid FK → contacts | not null, on delete restrict |
| company_id | uuid FK → companies | nullable — who referred this job |
| job_number | text unique not null | human-readable, e.g. `EI-2026-0143` |
| title | text not null | e.g. "Kitchen countertops — quartz" |
| site_address | text | where the work happens; often ≠ contact address |
| stage | job_stage not null | default `new` |
| value_est | numeric(12,2) | |
| value_final | numeric(12,2) | |
| lead_source | text | attribution for *this job* |
| assigned_to | uuid FK → profiles | nullable |
| won_at | timestamptz | stamped by the stage-change trigger; application code never writes it |
| lost_at | timestamptz | stamped by the stage-change trigger; application code never writes it |
| lost_reason | text | required when stage = `lost` (enforce in app — a trigger cannot prompt) |
| deleted_at | timestamptz | |

Two `lead_source` columns is deliberate. A Meta lead who later refers a neighbour
has two different attributions; collapsing them destroys the campaign reporting.

### appointments
Replaces loose date fields on the job. A job has many scheduled events.

| column | type | notes |
|---|---|---|
| job_id | uuid FK → jobs | not null, on delete cascade |
| kind | appt_kind not null | |
| starts_at | timestamptz not null | |
| ends_at | timestamptz | |
| assigned_to | uuid FK → profiles | crew member |
| notes | text | |

### quotes / quote_line_items

| quotes | type | notes |
|---|---|---|
| job_id | uuid FK → jobs | not null, cascade |
| quote_number | text unique not null | |
| status | quote_status not null | default `draft` |
| subtotal, tax_rate, tax_amount, total | numeric(12,2) / numeric(5,4) | |
| valid_until | date | |
| design_quote_id | uuid | link to the `/design` tool output, nullable |
| sent_at, accepted_at | timestamptz | |
| body_snapshot | jsonb | terms + totals as sent |

| quote_line_items | type |
|---|---|
| quote_id | uuid FK, cascade |
| position | int |
| description | text |
| quantity | numeric(10,2) |
| unit | text |
| unit_price | numeric(12,2) |
| amount | numeric(12,2) |

### invoices / invoice_line_items

Same column shape as quotes but a **separate table**. Quotes expire; invoices
accrue. Different lifecycles, different required fields, different state machines.
Do not merge them — write `convert_quote_to_invoice()` instead.

| invoices | type | notes |
|---|---|---|
| job_id | uuid FK → jobs | not null, restrict |
| quote_id | uuid FK → quotes | nullable, where it came from |
| invoice_number | text unique not null | sequential, gapless |
| status | invoice_status not null | default `draft` |
| issue_date, due_date | date | |
| subtotal | numeric(12,2) | |
| tax_rate | numeric(5,4) | **stored per invoice.** ON HST = `0.1300` |
| tax_amount, total | numeric(12,2) | |
| amount_paid | numeric(12,2) | maintained by trigger from payments |
| stripe_payment_link | text | |
| sent_at, paid_at, voided_at | timestamptz | |

Once `status` leaves `draft`, the invoice and its line items are immutable.
Corrections are a void plus a new invoice.

### payments

| column | type | notes |
|---|---|---|
| job_id | uuid FK → jobs | not null |
| invoice_id | uuid FK → invoices | nullable |
| kind | payment_kind not null | |
| method | payment_method not null | |
| amount | numeric(12,2) not null | |
| received_at | date not null | |
| reference | text | e-transfer confirmation, cheque number |

Most volume is e-transfer and cheque. Manual entry is a first-class path, not a
fallback.

### contracts

| column | type | notes |
|---|---|---|
| job_id | uuid FK → jobs | not null |
| template_version | text not null | |
| body_snapshot | text not null | **full contract text exactly as sent** |
| status | contract_status not null | default `draft` |
| sign_token | text unique | single-use, for the public signing link |
| token_expires_at | timestamptz | |
| sent_at, signed_at | timestamptz | |
| signer_name, signer_email | text | |
| signer_ip | inet | audit trail |
| signature_image_path | text | Storage path |
| signed_pdf_path | text | Storage path, immutable |

Under Ontario's *Electronic Commerce Act, 2000* an electronic signature is
enforceable. What makes it defensible in a dispute is the audit trail: verified
email, timestamp, IP, and a tamper-evident copy of exactly what was signed.
All four are required — none are optional.

### activities
Append-only timeline. Never update, never delete (enforced by trigger).

| column | type |
|---|---|
| job_id | uuid FK → jobs, **nullable**, cascade when set — nullable so job-less comms still log; contact-level events carry only `contact_id` |
| contact_id | uuid FK → contacts, nullable, on delete set null |
| kind | activity_kind not null |
| body | text |
| meta | jsonb — e.g. `{"from":"quoted","to":"won"}` |
| user_id | uuid FK → profiles, nullable, on delete set null |

Stage changes write a `stage_change` row via trigger. This is what gives you
cycle-time reporting later, so it is not optional. Calls and messages each get
exactly one activity row, written atomically by `record_call()` /
`record_message()` — that is how comms land on the job timeline.

### tasks

| column | type |
|---|---|
| job_id | uuid FK → jobs, nullable |
| title | text not null |
| assigned_to | uuid FK → profiles |
| due_date | date |
| completed_at | timestamptz |

### files

| column | type |
|---|---|
| job_id | uuid FK → jobs, cascade |
| kind | file_kind not null |
| storage_path | text not null |
| filename | text |
| size_bytes | bigint |
| uploaded_by | uuid FK → profiles |

Supabase Storage bucket `job-files`, private, path `jobs/{job_id}/{uuid}-{filename}`.

Hard delete is permitted but only through `delete_file(file_id)`, which removes
the Storage object and the row in the same operation. Orphaned objects in a
private bucket accumulate forever and nothing else will ever clean them up.

### calls
One row per Twilio voice call. Written only by the service role through
`record_call()` — never directly by the client. The paired `activities` row is
what shows on timelines.

| column | type | notes |
|---|---|---|
| activity_id | uuid FK → activities | not null, **unique**, on delete restrict — one-to-one with the timeline row |
| job_id | uuid FK → jobs | nullable, on delete set null |
| contact_id | uuid FK → contacts | not null, on delete restrict — webhook matches or creates the contact |
| direction | call_direction not null | |
| from_number, to_number | text not null | E.164 |
| outcome | call_outcome | |
| started_at, answered_at, ended_at | timestamptz | |
| duration_seconds | int | |
| recording_path | text | Storage path in the `comms` bucket |
| consent_announced | boolean not null default false | the pre-connect recorded-call announcement played (PIPEDA); a `call_recording` consent row is written alongside |
| provider_call_sid | text unique not null | idempotency key — webhook replays upsert on this |
| notes | text | the only column clients may update |

### messages
One row per SMS/MMS, threaded per contact. Written only by the service role
through `record_message()`; status callbacks update rows in place.

| column | type | notes |
|---|---|---|
| activity_id | uuid FK → activities | not null, **unique**, on delete restrict |
| job_id | uuid FK → jobs | nullable, on delete set null |
| contact_id | uuid FK → contacts | not null, on delete restrict — inbound webhook matches or creates the contact |
| direction | call_direction not null | shared enum: inbound / outbound |
| from_number, to_number | text not null | E.164 |
| body | text | |
| status | message_status not null | |
| media_paths | text[] | Storage paths in the `comms` bucket — inbound MMS media is copied there, same retention logic as recordings |
| sent_at, delivered_at | timestamptz | |
| error_code | text | carrier/Twilio error on failure |
| provider_message_sid | text unique not null | idempotency key |

A before-insert trigger rejects an **outbound** message when the latest `sms`
consent record for `to_number` is `withdrawn`. That is the database-level STOP
guarantee. The send function additionally fails **closed**: no valid unexpired
grant, no send.

Recordings and media live in a second private Storage bucket `comms`:
`calls/{call_id}/recording.mp3`, `messages/{message_id}/{filename}`. Playback
and display use short-lived signed URLs. We control retention — nothing is
left hosted at Twilio.

### consent_records
Append-only CASL/PIPEDA evidence. Never updated, never deleted — withdrawal
is a new row. Consent attaches to the **number** (carriers opt out numbers,
not people); the contact link is for reporting.

| column | type | notes |
|---|---|---|
| contact_id | uuid FK → contacts | not null, on delete restrict |
| phone_number | text not null | E.164 — the number the consent applies to |
| channel | consent_channel not null | |
| status | consent_status not null | |
| source | text not null | e.g. `inbound_sms`, `web_form`, `verbal`, `pre_connect_announcement` |
| evidence | jsonb | e.g. the inbound message SID and body that constitutes the grant |
| granted_at | timestamptz | |
| expires_at | timestamptz | CASL implied consent expires |
| withdrawn_at | timestamptz | |

An inbound message auto-creates an implied `sms` grant with the inbound
message itself as evidence — real evidence, not a fiction, and what makes
replying to an inbound text legal under CASL.

### inbound_leads
Raw enquiries captured before triage into a contact and job. **Store the raw
payload first, parse second** — every integration eventually sends a shape we
did not expect, and a parse failure must never lose the lead. Never deleted;
this table is the denominator for lead-conversion reporting. Spam is
discarded, not erased.

| column | type | notes |
|---|---|---|
| provider | lead_provider not null | |
| raw_payload | jsonb not null | the untouched body, always — stored before any parsing is attempted |
| received_at | timestamptz not null default now() | |
| parsed_name | text | best-effort |
| parsed_phone | text | **no E.164 CHECK** — see Phone numbers; normalise at conversion, not ingest |
| parsed_email | text | |
| parsed_message | text | |
| parse_error | text | null when parsing succeeded |
| contact_id | uuid FK → contacts | nullable, on delete set null — set on conversion |
| job_id | uuid FK → jobs | nullable, on delete set null — set on conversion |
| converted_at | timestamptz | |
| discarded_at | timestamptz | spam/junk; rows are never deleted |

The ingest endpoint inserts `raw_payload` before it attempts to parse; a parse
failure writes `parse_error` rather than throwing; and it returns 200 to the
sender once the row is stored — otherwise Zapier retries forever on a lead we
already have.

---

## Functions and triggers

Defined in the Slice 0 migration; the schema is not complete without them.

- `set_updated_at()` — attached to every table, on update.
- `log_stage_change()` — fires when `jobs.stage` changes: writes the
  `stage_change` activity row with `{"from","to"}` meta, and stamps
  `won_at` / `lost_at` when the stage enters `won` / `lost`. Application code
  never writes those columns. `lost_reason` stays app-enforced.
- `block_mutations()` — one shared append-only guard, attached per table:
  rejects `UPDATE` and `DELETE` on `activities` and `consent_records`, and
  `DELETE` per the matrix below. One pattern, not a set of exceptions.
- `enforce_sms_consent()` — before insert on `messages`, outbound only:
  rejects when the latest `sms` consent record for `to_number` is `withdrawn`.
- `next_document_number(prefix)` — gapless numbering; see Numbering.
- `record_call(...)` / `record_message(...)` — the only write path for comms
  rows. Atomically insert the `activities` row and the call/message row in one
  transaction; idempotent on the provider SID, so a replayed webhook produces
  one row, not two.
- `delete_file(file_id)` — the only way to delete a file: removes the Storage
  object and the `files` row together, never in client code.
- `convert_quote_to_invoice()` — Slice 8.

---

## RLS and delete policy

Small single-office team. Do not build permissions you do not need.

- All tables: authenticated users may `select`. No public access, ever.
- Authenticated users may `insert` and `update` operational tables, with these
  exceptions:
  - `profiles`: a user may update only their own row.
  - `activities` and `consent_records`: insert only — append-only guard blocks
    `UPDATE` and `DELETE`.
  - `calls` and `messages`: written only by the service role through
    `record_call()` / `record_message()`. Clients may update `calls.notes` and
    nothing else. The consent trigger fires for the service role too — that is
    what makes the STOP block real.
- Immutability on `invoices`, `invoice_line_items`, and `contracts` once sent
  is enforced by a trigger (Slice 8), not by RLS.
- **The public signing and payment pages never touch RLS.** They go through Edge
  Functions with the service role, gated by a single-use token. Opening an anon
  policy to make a public page work is a data leak.

`DELETE` is explicit, per table:

| policy | tables |
|---|---|
| soft delete only — `deleted_at`; `DELETE` denied at the DB | companies, contacts, jobs |
| hard delete permitted | tasks, appointments; files **only via `delete_file()`**; quote_line_items and invoice_line_items **only while the parent document is `draft`** |
| delete permanently denied | activities, calls, messages, payments, quotes, invoices, contracts, consent_records, inbound_leads |

---

## Numbering

`job_number`, `quote_number`, and `invoice_number` come from
`next_document_number(prefix)`, backed by a `document_counters (prefix, year,
last_value)` table incremented under a row-level lock. It returns
`{prefix}-{year}-{NNNN}` — prefixes `EI` (jobs), `Q` (quotes), `INV` (invoices).

Not a Postgres sequence: sequences do not roll back, so a failed insert would
burn a number. Invoice numbers must be gapless — never generated client-side,
never derived from a count. `document_counters` has no RLS policies of its
own; it is touched only inside the security-definer function.
