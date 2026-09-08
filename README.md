# Budgets — PoC

Proof of concept for the budget tool described in [PRD.md](./PRD.md): import
credit card statements, auto-categorize transactions, and track spend vs.
budget — on your own phone (Android or iPhone), with two independent users
sharing one small backend.

## Structure

- `server/` — Node + Express + SQLite (Node's built-in `node:sqlite`) API.
  Handles login, accounts, CSV statement import + dedup + categorization,
  transactions, and budgets. Each user's data is scoped to their login.
- `app/` — Expo (React Native) app. Runs on both iOS and Android via
  [Expo Go](https://expo.dev/go) — no app-store build needed for the PoC.

## Running the PoC

### 1. Start the backend

```
cd server
npm install
npm start
```

Runs on `http://0.0.0.0:4000`. Find your computer's LAN IP (e.g. on macOS:
`ipconfig getifaddr en0`; on Windows: `ipconfig`) — both phones need it to
reach the server over Wi-Fi. `localhost` from a phone means the phone
itself, not your computer.

### 2. Start the app

```
cd app
npm install
npx expo start
```

Scan the QR code with the **Expo Go** app (App Store / Play Store) on each
phone. Both phones must be on the same Wi-Fi network as the computer
running the server.

### 3. Log in

On first launch, enter your computer's LAN IP as the **Server URL**
(e.g. `http://192.168.1.42:4000`), then create an account. Each of the two
users registers their own username/password — accounts, transactions, and
budgets are private to each login.

### 4. Try the flow

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

## Known PoC limitations

See PRD.md §6 for the full scope cuts. Notably: CSV import only (no
OFX/QFX/PDF), no reconciliation dashboard, no exports, and auth is
username/password with no password reset — fine for two known users
testing on a home network, not for anything public-facing.
