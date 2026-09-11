# Budgets — PoC

Proof of concept for the budget tool described in [PRD.md](./PRD.md): import
credit card statements, auto-categorize transactions, and track spend vs.
budget — on your own phone (Android or iPhone), with two independent users
sharing one small backend.

## Structure

- `appscript/` — the live backend: a Google Apps Script Web App bound to a
  Google Sheet that acts as the database. Handles login, accounts, CSV
  statement import + dedup + categorization, transactions, and budgets.
  Each user's data is scoped to their login. Runs on Google's
  infrastructure — no computer has to stay on for either phone to reach it.
- `app/` — Expo (React Native) app. Runs on both iOS and Android via
  [Expo Go](https://expo.dev/go) — no app-store build needed for the PoC.
- `server/` — the original Node/Express/SQLite backend from before this went
  live. Superseded by `appscript/`; kept for reference, not run anymore. See
  `server/README.md`.

## One-time backend setup (Apps Script)

The backend is Google Apps Script + a Sheet, deployed with
[`clasp`](https://github.com/google/clasp) (`npm install -g @google/clasp`,
already done in this environment).

1. **Log in** (interactive, opens a browser — do this yourself):
   ```
   clasp login
   ```
2. **Create the bound Sheet + script** (creates a new Google Sheet titled
   "Budgets DB" and an Apps Script project attached to it, then pushes the
   source in `appscript/`):
   ```
   cd appscript
   clasp create --type sheets --title "Budgets DB"
   clasp push
   ```
3. **Create all the tabs up front** — open the project (`clasp open-script`),
   pick **Setup.gs** in the file list so its functions show in the dropdown,
   pick **setupSpreadsheet**, click **Run**. This creates every tab
   (including the two `QuickAdd` ones, so they're there to open and type
   into right away) instead of leaving them to be created lazily on first
   use. First run also asks you to authorize the script — click through it.
4. **Set an invite code** — registration is invite-only (see "Restricting
   who can register" below). In the editor, click the gear icon (Project
   Settings) → Script Properties → Add script property → name it
   `INVITE_CODE`, value whatever code you want to hand the other user.
5. **Deploy as a Web App** — either `clasp deploy`, or from the Apps Script
   editor: Deploy → New deployment → type **Web app** → Execute as **Me** →
   Who has access **Anyone**.
6. Copy the deployment's `/exec` URL (looks like
   `https://script.google.com/macros/s/AKfycb.../exec`).

Any time the `appscript/` source changes, re-run `clasp push` from that
directory, then create a new deployment (or use `clasp deploy` again) for
the change to take effect at the existing URL — pushing alone updates the
editor copy, not what's live.

## Running the app

### 1. Start the app

```
cd app
npm install
npx expo start
```

Scan the QR code with the **Expo Go** app (App Store / Play Store) on each
phone.

### 2. Log in

On first launch, paste the Apps Script `/exec` URL from setup step 6 as the
**Server URL**, then create an account — registering asks for the invite
code from setup step 4 as well as a username/password. Each of the two
users registers their own login; accounts, transactions, and budgets are
private to each login.

## Restricting who can register

The Web App deployment itself is set to "Anyone" access (no Google sign-in
required), since the app talks to it with a plain `fetch()` — restricting
that to specific Google accounts would mean rebuilding the client around
Google Sign-In. For now, the deployment stays open but **registration is
gated by the `INVITE_CODE` script property** (setup step 4): anyone who
finds the `/exec` URL can still hit it, but can't create an account without
that code, and existing logins aren't affected either way. Change or remove
the value any time from Project Settings → Script Properties in the Apps
Script editor — no redeploy needed, it's read live on every registration
attempt. Moving to real Google OAuth (restricting the deployment to named
Google accounts) is a possible later step, not done here.

### 3. Try the flow

1. **Accounts** tab → add a credit card account → **Import Statement (CSV)**.
2. **Transactions** tab → see auto-categorized transactions for the current
   month; tap a category to correct it (this also saves a rule for that
   merchant going forward).
3. **Budgets** tab → tap a category to set a monthly budget amount, see
   spend vs. budget update live.

### CSV format

The importer looks for `Date`/`Description`/`Amount` columns (or separate
`Debit`/`Credit` columns) by header name — most credit card issuer CSV
exports work as-is. Amount convention: **positive = charge/spend,
negative = payment/credit/refund**.

## Quick Add (manual entries)

For purchases or budgets you'd rather type in by hand than import from a
statement, the "Budgets DB" spreadsheet has two extra tabs you can open and
edit directly in Google Sheets:

- **QuickAdd Purchases**: `Date | Description | Amount | Account` —
  `Account` should match an account's name exactly (case-insensitive);
  same amount convention as CSV (positive = spend).
- **QuickAdd Budgets**: `Month | Category | Amount` — `Month` as `YYYY-MM`;
  `Category` must match an existing category name or the row is skipped.

These tabs are deliberately separate from the real data — a typo or bad row
here can't corrupt anything. Nothing moves into the real Transactions/
Budgets tabs until you tap **Sync Quick Add** in the app (Accounts tab, per
account, for purchases; Budgets tab for budgets), which validates and
dedupes each row the same way a CSV import does.

## Known PoC limitations

See PRD.md §6 for the full scope cuts. Notably: CSV/Quick Add import only
(no OFX/QFX/PDF), no reconciliation dashboard, no exports, and auth is
username/password with no password reset. The Web App URL is reachable from
the internet (not just a home network), so login attempts are rate-limited
with a temporary lockout after repeated failures — see `appscript/Auth.gs`.
