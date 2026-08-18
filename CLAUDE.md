# CLAUDE.md — Eternal CRM

Internal operations system for Eternal Interiors. Replaces Trello (job tracking) and
InvoiceFly (invoicing) with one platform.

**Read `docs/SCHEMA.md` and the current slice in `docs/ROADMAP.md` before writing any code.**

---

## Stack

Do not add to this list without an entry in `docs/DECISIONS.md`.

| Layer | Choice |
|---|---|
| Build | Vite + React 18 + TypeScript (strict) |
| Data | Supabase — Postgres, Auth, Storage, RLS |
| Styling | Tailwind |
| Server state | TanStack Query |
| Routing | React Router |
| Forms | react-hook-form + zod |
| Payments | Stripe (payment links + webhook) |
| Comms | Twilio — voice (dial-out bridging) + SMS, Slice 10 (DECISIONS 012) |
| Deploy | Cloudflare Workers — static `./dist` via wrangler (DECISIONS 037) |

The CRM has its **own** Supabase project (DECISIONS 017). `/design` lives in a
separate project; any linkage between them is an API call, never a shared table.

---

## Working agreement

These are the standing rules. They override convenience.

1. **Read before you write.** Open the files you are about to change and the files
   next to them. Copy the existing pattern rather than introducing a new one.
2. **State the plan first.** Before coding, say what you will change, what you are
   assuming, and what the tradeoff is. If you are genuinely confused, ask — do not
   guess and proceed.
3. **Minimum code for the current problem.** No abstraction until there are three
   concrete cases. Two similar things are a coincidence.
4. **Surgical diffs.** Match the surrounding style. Do not reformat, rename, or
   reorganise files you were not asked to touch.
5. **Bugs get a failing test first.** Then fix the cause, not the symptom.
6. **Define done before starting.** Every slice in the roadmap has acceptance
   criteria. If they are not met, the slice is not done.
7. **Investigate, do not guess.** Read the whole stack trace. Change one thing at a
   time. When something is null, find out why it is null.
8. **Every dependency is permanent.** Justify it in `docs/DECISIONS.md` or do not
   add it.
9. **Say what changed and why.** Flag anything you are unsure about rather than
   presenting it as settled.
10. **Stop rather than push through.** If a change is ballooning, halt and report.

### Failure modes to watch for

- **Kitchen Sink** — building the next three slices while working on this one.
- **Wrong Abstraction** — merging quotes and invoices, generic `Entity` types,
  a `BaseRepository`. All forbidden here.
- **Optimistic Path** — no loading state, no empty state, no error state.
- **Runaway Refactor** — a two-line fix that becomes forty files.

---

## Non-negotiables

**Destructive commands run against LOCAL Docker only.** Reset, drop, and
truncate are never run against the linked project. Once we cut over from
InvoiceFly the linked project holds live financial records, and there is no
undo. `db push` is the only command permitted against linked. `npm run
db:reset` targets local only; no script that can reset the linked project may
ever be added. (DECISIONS 016, 017.)

**Database**

- Schema changes go in a numbered migration in `supabase/migrations/`. Never edit
  the database through the dashboard UI.
- Every table gets `id uuid primary key default gen_random_uuid()`, `created_at
  timestamptz not null default now()`, `updated_at timestamptz not null default now()`.
- Every table gets an RLS policy in the same migration that creates it. A table
  without RLS does not ship.
- Enums are Postgres enums, never free text. Adding a value is a migration.
- Money is `numeric(12,2)`. Never `float`, never `real`, never cents-as-integer.
- All timestamps are `timestamptz`. All dates without a time are `date`.
- Foreign keys always have an explicit `on delete` rule. Think about it each time.
- Index every foreign key column.
- Every phone number is stored E.164 (`+14165551234`), enforced by a CHECK
  constraint on every phone column. Normalise on write. Format for display only
  in `lib/format.ts`. Inbound comms match contacts by exact number — dirty
  phone data breaks threading.

**Money and legal**

- `invoices.tax_rate` is stored per invoice, not read from a constant. Ontario HST
  is 13% today; historical invoices must render with the rate they were issued at.
- The HST registration number renders on every invoice.
- `contracts.body_snapshot` stores the full contract text as sent. Never a
  reference to a template that can later change.
- Signed contracts and issued invoices are **immutable**. Corrections are a new
  document plus a void/credit record, never an `UPDATE`.

**Public-facing endpoints**

The contract signing page and the invoice payment page are reachable without login.
They go through Supabase Edge Functions using the service role and a single-use
token. Do not open an anon RLS policy on `contracts`, `invoices`, or `jobs` to make
a public page work.

---

## Out of scope

Not in v1. If a request drifts toward one of these, stop and say so.

- Sending email from the app. (Native calling and SMS via Twilio **are** in
  scope — Slice 10, see DECISIONS 012. Email is not.)
- Workflow automations, triggers, drip sequences
- A native mobile app — the mobile story is the PWA (Slice 14); Capacitor is
  the fallback if App Store presence is ever required (DECISIONS 014)
- Per-client white-labelled mobile apps. Apple 4.2.6 and 4.3(a) make
  per-client binaries a rejection; the only compliant route is one app branded
  at runtime, which is a resale product we are not building.
- Replacing accounting software — we export to QuickBooks, we do not become it
- Multi-tenancy, white-labelling, or anything aimed at reselling this
- Per-user row-level permissions (small team; all authenticated staff see everything)
- A customer-facing portal

---

## Conventions

```
src/
  components/     shared UI primitives
  features/       one folder per domain: jobs/, contacts/, invoices/, contracts/
    jobs/
      api.ts          Supabase queries + TanStack Query hooks
      schema.ts       zod schemas
      components/     UI local to this feature
      routes/         page components
  lib/            supabase client, formatters, utils
  types/          generated Supabase types (do not hand-edit)
supabase/
  migrations/     numbered SQL, forward-only
  functions/      edge functions
docs/
```

- Regenerate `src/types/database.ts` from Supabase after every migration.
- Currency and dates are formatted in one place in `lib/format.ts`. Nowhere else.
- Any query that can fail renders a loading, empty, and error state. All three.

---

## Definition of done

A slice is done when:

- Its acceptance criteria in `docs/ROADMAP.md` all pass, checked manually
- Migrations run clean on a fresh database
- `tsc --noEmit` and the linter pass with zero warnings
- Loading, empty, and error states exist for every async view
- It is committed on its own branch with a message naming the slice
- Any decision made along the way is logged in `docs/DECISIONS.md`
