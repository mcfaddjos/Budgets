# PRD: Personal Budget Tool with Bank Statement Import

**Status:** Draft
**Author:** Joe McFadden
**Last updated:** 2026-09-08

## 1. Summary

A personal budgeting tool that ingests bank statements — **credit cards are the primary focus**, with savings/checking as secondary — automatically parses and categorizes transactions, and reconciles them against a budget so spending is documented without manual data entry. Two independent users, each with their own personal accounts, use the same app on their own phone (Android or iPhone). The tool replaces manual spreadsheet upkeep with an import-once, categorize-and-review workflow.

## 2. Problem Statement

Tracking spending against a budget today means manually copying transactions out of credit card statements into a spreadsheet — slow, error-prone, and easy to fall behind on. Credit cards are where the bulk of discretionary spending shows up, so that's the statement type this tool needs to handle best. There's no single place that shows "here's what I budgeted, here's what actually happened, here's what's uncategorized or looks wrong," and there's no mobile-friendly way to check it on the go.

## 3. Goals

- Import transactions from credit card statements (primary) and bank/checking/savings statements (secondary) with minimal manual entry.
- Automatically categorize transactions, with easy manual override and rule creation.
- Track actual spend against budgeted amounts per category, per month.
- Reconcile imported transactions against budget line items and flag discrepancies (duplicates, missing categories, unexpected large charges).
- Provide a clear month-over-month and category-level view of spending for documentation/review purposes.
- Support two separate users, each managing their own personal accounts independently (not a shared/joint budget), from their own phone.

## 4. Non-Goals

- Live bank account connections via Plaid/Yodlee-style aggregation (PoC/v1 is file-based import only; may revisit later).
- Investment portfolio tracking, net worth, or bill-pay/transfers.
- Multi-currency support (v1 assumes a single home currency).
- Shared/joint budgets between the two users — each user's accounts and data are private to them.
- Native platform-specific features beyond what Expo/React Native provides out of the box (e.g., no custom native modules in the PoC).

## 5. Users

- Two individual users, each with their own login and their own set of personal accounts (credit cards primarily, plus savings/checking). Each uses the app on their own phone — one Android, one iPhone. No shared data between them in this phase.

## 6. Proof of Concept Scope

The PoC's job is to prove the core loop end-to-end on a real phone: **log in → import a credit card statement → see categorized transactions → see spend vs. budget.** It intentionally cuts scope versus the full PRD below:

- **Platform:** React Native app via Expo, runnable on both iOS and Android (via Expo Go during development; can be built to standalone app-store binaries later with `eas build`).
- **Backend:** a single small Node/Express + SQLite server, shared by both users, reachable over the network from both phones. Each user's accounts/transactions/budgets are scoped to their login server-side.
- **Auth:** simple username + password login (hashed passwords, session token). Not production-grade auth (no OAuth/SSO, no password reset) — sufficient for two known users testing the PoC.
- **Import format:** CSV only for the PoC (most credit card issuers export CSV directly; OFX/QFX and PDF are deferred — see Non-Goals for full v1).
- **Categorization:** keyword-based default rules + manual override; per-user learned rules.
- **Budgeting:** one budget amount per category per month; actual-vs-budget view.
- **Out of scope for PoC:** OFX/QFX/PDF import, reconciliation-flagging dashboard, trend reports, CSV/PDF export, bulk re-categorization UI, subcategories.

## 7. User Stories

1. As a user, I can upload a bank statement file (CSV/OFX/QFX/PDF) and have its transactions added to my transaction list without duplicates.
2. As a user, I can see each transaction auto-assigned to a spending category, and correct it if it's wrong.
3. As a user, when I correct a category, I can save a rule so future transactions from that merchant categorize the same way automatically.
4. As a user, I can set a monthly budget per category and see actual vs. budgeted spend, updated as I import new statements.
5. As a user, I can see a reconciliation view that flags: duplicate transactions, uncategorized transactions, and transactions above a configurable threshold.
6. As a user, I can view spending history by category and month, and export it (CSV/PDF) for my own records.
7. As a user, I can mark a transaction as "reviewed" so I know I've already looked at it.

## 8. Functional Requirements (full v1 — beyond PoC)

### 8.1 Statement Import
- Support CSV upload with a column-mapping step (date, description, amount, optional balance) since issuer CSV formats vary.
- Support OFX/QFX parsing (standard bank/card export format) with no mapping needed.
- Support PDF statement upload with text extraction for issuers that only offer PDF statements; flag low-confidence extractions for manual review rather than silently guessing.
- Deduplicate transactions on import using date + amount + normalized description (+ statement source) to avoid double-counting overlapping statement periods.
- Support multiple accounts per user (multiple credit cards, plus savings/checking), each statement import tagged to an account.

### 8.2 Categorization
- Maintain a configurable category list (e.g., Groceries, Dining, Utilities, Transport, Entertainment, Income, Transfer).
- Auto-categorize on import using: (a) user-defined merchant/description rules, (b) a default keyword-based ruleset shipped with the app, (c) fallback to "Uncategorized."
- Allow bulk re-categorization (select multiple transactions → assign category).
- Learn from manual corrections by prompting "Always categorize [merchant] as [category]?" and saving as a rule.

### 8.3 Budgeting
- Allow setting a target budget amount per category per month.
- Support carrying over the previous month's budget as a starting point for the next.
- Show actual vs. budget with variance ($ and %) per category, and a total.

### 8.4 Reconciliation & Review
- Dashboard view flagging: possible duplicates, uncategorized transactions, transactions over a user-set threshold, and transactions with no matching budget category.
- "Mark reviewed" state per transaction so recurring review work is trackable.
- Running reconciliation total per account (sum of imported transactions) that the user can sanity-check against the statement's stated balance.

### 8.5 Reporting
- Monthly summary: total spend, spend by category, budget variance.
- Trend view: category spend over time (last 3/6/12 months).
- Export transactions and summaries to CSV and PDF.

## 9. Data Model (high level)

- **User**: id, username, password_hash.
- **Account**: id, user_id, name, type (credit/checking/savings), institution.
- **Statement Import**: id, account_id, file type, imported_at, source filename, date range covered.
- **Transaction**: id, account_id, statement_import_id, date, description (raw + normalized), amount, category_id, reviewed (bool), notes.
- **Category**: id, user_id, name, parent_category_id (optional, for subcategories).
- **Category Rule**: id, user_id, match_pattern (merchant/keyword), category_id.
- **Budget**: id, user_id, category_id, month, amount.

## 10. Non-Functional Requirements

- **Security & privacy:** statement data is sensitive financial data, scoped strictly per user — one user must never see another's accounts/transactions. Store data encrypted at rest; never transmit statement files or parsed data to third parties. No live credential-based bank login, which sidesteps storing bank passwords entirely.
- **Data ownership:** user can export or delete all their data at any time.
- **Accuracy:** parsing errors must be surfaced, not silently dropped — a failed row/transaction should be visibly flagged, not swallowed.
- **Performance:** importing a typical monthly statement (50–300 transactions) should complete in a few seconds.

## 11. Success Metrics

- % of imported transactions auto-categorized correctly (target: >85% after ruleset matures).
- Time from "download statement" to "fully reconciled" (target: under 5 minutes/month/account).
- Reduction in manually-entered transactions vs. current spreadsheet workflow (target: near zero manual entry).

## 12. Milestones

- **M0 — PoC (this phase):** Expo app + shared backend, login, CSV credit-card import, categorization, budget vs. actual — see Section 6.
- **M1 — Import & Categorize (full):** OFX import, PDF import, dedup hardening, bulk re-categorization.
- **M2 — Budgeting:** envelope/rollover budgets, multi-account rollups.
- **M3 — Reconciliation & Reporting:** flagging dashboard, trend reports, exports.
- **M4 (stretch) — App-store builds (`eas build`), push notifications for large transactions.**

## 13. Open Questions

- Which card issuers need to be supported first (determines CSV format variety)?
- Should budgets be envelope-style (rolling unspent balance carries forward) or reset-each-month?
- Where should the backend actually run for the PoC (local machine on the home network vs. a small always-on host) so both phones can reach it?
- Do we eventually want app-store distribution (`eas build` + TestFlight/Play internal testing), or is Expo Go sufficient long-term for a two-user tool?
