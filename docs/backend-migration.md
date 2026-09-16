# Backend migration: Apps Script → Postgres + Express

Concrete plan behind `backend/` on this branch. Background/reasoning is in
`PRD.md` §14a; this doc is the actionable version.

## Status

**Scaffolded, not deployed, not wired to the app yet.** See
`backend/README.md` for exactly what's ported vs. still a `TODO`, and what
was validated without a live database (schema + module graph + error
handling) versus what still needs a real Postgres to confirm (actual
queries).

## Why Postgres over reviving the old `server/`'s SQLite

`server/` (archived) used `node:sqlite` — a single-file, single-writer
database. Fine for one always-on process with a persistent disk, but a
real hazard on hosts that can run multiple instances of your app at once
(Cloud Run, for one) — multiple instances writing one SQLite file is a
corruption/locking risk, the same class of problem this whole migration
exists to get away from. Managed Postgres (Supabase, Neon, Render, Railway
all have real free tiers) also gets encryption-at-rest and backups for
free instead of DIY — closes a PRD §10 gap as a side effect of the
migration rather than a separate task.

## Why the client protocol didn't change

`backend/src/dispatch.js` speaks the exact same `{action, token, payload}`
→ `{ok, data|error}` envelope the app already sends to the appscript
backend. `app/src/api/client.js`'s `call()` function doesn't need to
change at all to point here later — just `serverUrl`. The
retry-for-redirect-flakiness logic in `client.js` becomes dead weight once
nothing's redirecting through `script.googleusercontent.com` anymore, but
leaving it in is harmless (it just never triggers) — worth removing as a
cleanup pass once the switch is confirmed working, not urgent before then.

## Remaining steps, in order

1. **Get a real Postgres instance** and confirm `prisma migrate dev`
   actually applies the schema — nothing in this scaffold has touched a
   live database yet (no Docker available in the environment this was
   scaffolded in). This is the first thing to do, before anything else,
   since it's the one part of the scaffold that's unverified.
2. **Port CSV import** (`appscript/Csv.gs` + the import loop in
   `Transactions.gs`) into `backend/src/handlers/transactions.js` — marked
   `TODO` there. Pure-function parsing logic, translates directly.
3. **Decide on QuickAdd's replacement** (or confirm it doesn't need one) —
   see the `TODO` in `backend/src/handlers/budgets.js`. The app now has a
   real "+ Add Category" and budget editor; QuickAdd may have just been a
   Sheets-specific workaround for not having those yet.
4. **Pick a host and actually deploy** — Cloud Run, Fly.io, Render, or
   Railway are the live free-tier options as of the PRD's research; ideally
   one that also offers the Postgres instance from step 1 so there's one
   provider instead of two.
5. **Point the app at it**: change `client.js`'s `DEFAULT_SERVER_URL` (or
   just the Server URL entered in the app), remove the appscript-specific
   retry-on-flaky-redirect logic in `call()` as a cleanup once confirmed
   stable.
6. **Data migration**: the live Apps Script/Sheets data is disposable PoC
   data (per earlier session notes, nothing precious yet) — plan is to
   start fresh on the new backend rather than write a Sheets→Postgres
   migration script for data that doesn't need preserving. Revisit this
   assumption if real data accumulates before the migration happens.
7. Once stable, `appscript/` can be archived the same way `server/` was —
   not deleted, just marked superseded.

## Deliberately deferred, not forgotten

- The client still points at Apps Script. Nothing here is live.
- Auth still uses this app's own username/password + session tokens, not
  Google OAuth — the earlier Google Sign-In plan (issue #2) was closed as
  superseded by this migration, but nothing about *this* plan requires
  revisiting that decision. Could still be worth doing later on the new
  backend, just isn't blocking anything here.
- No object storage wired up yet for receipt images (PRD §8.6) — not
  needed until that feature actually starts.
