# backend — Postgres + Express (in progress)

Replaces `appscript/` (see `PRD.md` §14a for why: confirmed platform-level
reliability limits in Apps Script's Web App response delivery, not
something fixable from application code). Not deployed or wired up to the
app yet — this is the scaffold from `docs/backend-migration.md`.

## What's here

- `prisma/schema.prisma` — the full data model (PRD §9/§5b): households as
  the real data owner, a `HouseholdMember` join table (not a column on
  `User`) so a user belonging to more than one household later needs no
  schema change, household-scoped `Invite`s replacing the appscript
  backend's single global `INVITE_CODE`, real session expiry.
- `src/dispatch.js` + `src/handlers/*.js` — action handlers, ported from
  the equivalent `appscript/*.gs` files. **Same `{action, token, payload}`
  envelope protocol the app already speaks** — deliberately kept identical
  so pointing the existing client here later is a `serverUrl` change, not
  a rewrite.
- **Ported and working**: auth (register/login/me/invite creation),
  accounts (list/create/delete), categories (list/create/rename),
  transactions (list/create/update/delete/formOptions), budgets (get/set).
- **Not ported yet** (see the `TODO` comments in
  `src/handlers/transactions.js` and `src/handlers/budgets.js`):
  - CSV statement import (`appscript/Csv.gs` + the import loop in
    `Transactions.gs`) — a clean port once needed, just left out of the
    initial scaffold to keep it reviewable.
  - The QuickAdd-sheet sync mechanism — worth a decision on whether it's
    still wanted at all now that the app has a real "+ Add Category" and
    budget editor doing that job directly, or whether it was really just a
    Sheets-specific workaround.
  - Receipt/photo capture (PRD §8.6) — not started anywhere yet.

## Validated so far (no live database available in this environment)

- `npx prisma validate` — schema is syntactically and relationally valid.
- `npx prisma generate` — the full Prisma Client generates cleanly from
  the schema (this exercises every relation/unique/index, not just syntax).
- The whole module graph (`require("./src/dispatch")`) resolves with no
  missing imports or typos.
- The Express server boots and `/api/health` responds.
- Error handling verified end-to-end **without** a real database: an
  unknown action and a DB-dependent action (tried against a fake
  `DATABASE_URL`) both return a clean `{ok: false, error: "..."}` instead
  of crashing the process.
- **Not yet verified**: any actual query against a real Postgres instance —
  needs a real `DATABASE_URL` (see setup below) and `prisma migrate dev`
  actually run against it.

## Local setup

1. Get a Postgres connection string. Easiest for local dev: a free
   [Neon](https://neon.tech) or [Supabase](https://supabase.com) project
   (no local Postgres install needed), or `docker run -e
   POSTGRES_PASSWORD=dev -p 5432:5432 postgres` if you have Docker.
2. `cp .env.example .env` and fill in `DATABASE_URL`.
3. `npm install`
4. `npx prisma migrate dev --name init` — creates the tables from the
   schema and generates the client.
5. `npm run dev` — starts the server on `:4000` with auto-restart on file
   changes.

## Trying it

```bash
curl -X POST http://localhost:4000/api \
  -H "Content-Type: application/json" \
  -d '{"action":"auth.register","payload":{"username":"joe","password":"testpass123"}}'
```

A `token` comes back in the response — use it as the `token` field on any
authenticated action afterward.
