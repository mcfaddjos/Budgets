# PRD: Personal Budget Tool with Bank Statement Import

**Status:** Draft
**Author:** Joe McFadden
**Last updated:** 2026-09-08

## 1. Summary

A personal budgeting tool that ingests bank/credit card statements (CSV, OFX/QFX, and PDF), automatically parses and categorizes transactions, and reconciles them against a budget so spending is documented without manual data entry. The tool replaces manual spreadsheet upkeep with an import-once, categorize-and-review workflow.

## 2. Problem Statement

Tracking spending against a budget today means manually copying transactions out of bank statements into a spreadsheet — slow, error-prone, and easy to fall behind on. There's no single place that shows "here's what I budgeted, here's what actually happened, here's what's uncategorized or looks wrong."

## 3. Goals

- Import transactions from bank/card statements with minimal manual entry.
- Automatically categorize transactions, with easy manual override and rule creation.
- Track actual spend against budgeted amounts per category, per month.
- Reconcile imported transactions against budget line items and flag discrepancies (duplicates, missing categories, unexpected large charges).
- Provide a clear month-over-month and category-level view of spending for documentation/review purposes (e.g., tax prep, expense justification, shared household budgeting).

## 4. Non-Goals

- Live bank account connections via Plaid/Yodlee-style aggregation (v1 is file-based import only; may revisit later).
- Investment portfolio tracking, net worth, or bill-pay/transfers.
- Multi-currency support (v1 assumes a single home currency).
- Mobile app (v1 is web/desktop only).

## 5. Users

- **Primary:** the account owner, managing their own personal/household budget.
- **Secondary (optional, v1.x):** a spouse/partner with shared read/edit access to the same budget.

## 6. User Stories

1. As a user, I can upload a bank statement file (CSV/OFX/QFX/PDF) and have its transactions added to my transaction list without duplicates.
2. As a user, I can see each transaction auto-assigned to a spending category, and correct it if it's wrong.
3. As a user, when I correct a category, I can save a rule so future transactions from that merchant categorize the same way automatically.
4. As a user, I can set a monthly budget per category and see actual vs. budgeted spend, updated as I import new statements.
5. As a user, I can see a reconciliation view that flags: duplicate transactions, uncategorized transactions, and transactions above a configurable threshold.
6. As a user, I can view spending history by category and month, and export it (CSV/PDF) for my own records.
7. As a user, I can mark a transaction as "reviewed" so I know I've already looked at it.

## 7. Functional Requirements

### 7.1 Statement Import
- Support CSV upload with a column-mapping step (date, description, amount, optional balance) since bank CSV formats vary.
- Support OFX/QFX parsing (standard bank export format) with no mapping needed.
- Support PDF statement upload with text extraction for banks that only offer PDF statements; flag low-confidence extractions for manual review rather than silently guessing.
- Deduplicate transactions on import using date + amount + normalized description (+ statement source) to avoid double-counting overlapping statement periods.
- Support multiple accounts (checking, savings, multiple credit cards), each statement import tagged to an account.

### 7.2 Categorization
- Maintain a configurable category list (e.g., Groceries, Dining, Utilities, Transport, Entertainment, Income, Transfer).
- Auto-categorize on import using: (a) user-defined merchant/description rules, (b) a default keyword-based ruleset shipped with the app, (c) fallback to "Uncategorized."
- Allow bulk re-categorization (select multiple transactions → assign category).
- Learn from manual corrections by prompting "Always categorize [merchant] as [category]?" and saving as a rule.

### 7.3 Budgeting
- Allow setting a target budget amount per category per month.
- Support carrying over the previous month's budget as a starting point for the next.
- Show actual vs. budget with variance ($ and %) per category, and a total.

### 7.4 Reconciliation & Review
- Dashboard view flagging: possible duplicates, uncategorized transactions, transactions over a user-set threshold, and transactions with no matching budget category.
- "Mark reviewed" state per transaction so recurring review work is trackable.
- Running reconciliation total per account (sum of imported transactions) that the user can sanity-check against the statement's stated ending balance.

### 7.5 Reporting
- Monthly summary: total spend, spend by category, budget variance.
- Trend view: category spend over time (last 3/6/12 months).
- Export transactions and summaries to CSV and PDF.

## 8. Data Model (high level)

- **Account**: id, name, type (checking/savings/credit), institution.
- **Statement Import**: id, account_id, file type, imported_at, source filename, date range covered.
- **Transaction**: id, account_id, statement_import_id, date, description (raw + normalized), amount, category_id, reviewed (bool), notes.
- **Category**: id, name, parent_category_id (optional, for subcategories).
- **Category Rule**: id, match_pattern (merchant/keyword), category_id.
- **Budget**: id, category_id, month, amount.

## 9. Non-Functional Requirements

- **Security & privacy:** bank statement data is sensitive financial data. Store data encrypted at rest; never transmit statement files or parsed data to third parties. No live credential-based bank login in v1, which sidesteps storing bank passwords entirely.
- **Data ownership:** user can export or delete all their data at any time.
- **Accuracy:** parsing errors must be surfaced, not silently dropped — a failed row/transaction should be visibly flagged, not swallowed.
- **Performance:** importing a typical monthly statement (50–300 transactions) should complete in a few seconds.

## 10. Success Metrics

- % of imported transactions auto-categorized correctly (target: >85% after ruleset matures).
- Time from "download statement" to "fully reconciled" (target: under 5 minutes/month/account).
- Reduction in manually-entered transactions vs. current spreadsheet workflow (target: near zero manual entry).

## 11. Milestones

- **M1 — Import & Categorize:** CSV/OFX import, dedup, manual + rule-based categorization.
- **M2 — Budgeting:** category budgets, actual vs. budget view.
- **M3 — Reconciliation & Reporting:** flagging dashboard, trend reports, exports.
- **M4 (stretch) — PDF statement parsing, shared household access.**

## 12. Open Questions

- Which banks/institutions need to be supported first (determines CSV format variety and whether PDF parsing is needed at all for v1)?
- Should budgets be envelope-style (rolling unspent balance carries forward) or reset-each-month?
- Is multi-user (household) access needed for v1, or can it wait?
- Where should the app run — local-only (privacy-maximizing, no server) vs. hosted (enables shared access, backups)?
