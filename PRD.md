# PRD: Personal Budget Tool with Bank Statement Import

**Status:** Active development (PoC live, in daily use)
**Author:** Joe McFadden
**Last updated:** 2026-09-16 (ported open-questions/roadmap notes from PR #1's PRD audit before closing it as superseded)

## 1. Summary

A budgeting tool for **multiple people sharing one household budget** — same
accounts, same transactions, same categories and budget targets, each
person logging in with their own account so spending can be attributed to
whoever entered it. It ingests bank statements — **credit cards are the
primary focus**, with savings/checking as secondary — automatically parses
and categorizes transactions, and reconciles them against a budget so
spending is documented without manual data entry. The tool replaces manual
spreadsheet upkeep with an import-once, categorize-and-review workflow, and
now includes fast manual entry (including, on the roadmap, straight from a
photo of a receipt) for spending that never shows up on a statement.

**This is a change from the original design.** The PoC originally kept each
user's accounts/transactions/budgets completely private (see the old
Section 4 non-goal, now reversed) — see §5a for why and what changed.

## 2. Problem Statement

Tracking spending against a budget today means manually copying
transactions out of credit card statements into a spreadsheet — slow,
error-prone, and easy to fall behind on. Credit cards are where the bulk of
discretionary spending shows up, so that's the statement type this tool
needs to handle best. There's no single place that shows "here's what I
budgeted, here's what actually happened, here's what's uncategorized or
looks wrong," and there's no mobile-friendly way to check it on the go —
and for a two-person household, there's no single place both people can see
the same picture of spending while still knowing who spent what.

## 3. Goals

- Import transactions from credit card statements (primary) and bank/checking/savings statements (secondary) with minimal manual entry.
- Automatically categorize transactions, with easy manual override and rule creation.
- Track actual spend against budgeted amounts per category, per month.
- Reconcile imported transactions against budget line items and flag discrepancies (duplicates, missing categories, unexpected large charges).
- Provide a clear month-over-month and category-level view of spending for documentation/review purposes.
- **Share one household budget between two users**, each with their own login, while tracking which of them entered or imported each transaction (§5a).
- **Make manual/ad-hoc entry fast enough to actually use** — typed entry today, receipt/screenshot photo capture on the roadmap (§8.6) — since not all real spending (cash, a friend's Venmo request, a gas pump) ever produces a statement line.

## 4. Non-Goals

- Live bank account connections via Plaid/Yodlee-style aggregation (PoC/v1 is file-based import only; may revisit later).
- Investment portfolio tracking, net worth, or bill-pay/transfers.
- Multi-currency support (v1 assumes a single home currency).
- ~~Shared/joint budgets between the two users — each user's accounts and data are private to them.~~ **Reversed — see §5a.** The two users now share one household's data by design.
- Fully-automatic receipt/photo transaction capture with no human confirmation step — OCR/vision extraction is a *pre-fill*, not an auto-commit; see §8.6.
- Native platform-specific features beyond what Expo/React Native provides out of the box (e.g., no custom native modules in the PoC — though standalone `eas build` distribution is now in place, see §14).

## 5. Users

- Today: two individual users, each with their own login, sharing one household's accounts, transactions, categories, and budgets (see §5a). Each uses the app on their own phone — one Android, one iPhone (iOS build not yet done, see §14).
- **Designed for more than that, even though only one household exists today** (see §5b): the app itself is meant to eventually support any number of independent households, each invited into by their own members — not just "the one household these two people share."

### 5a. Shared household model (decision, 2026-09-11)

The original PoC scoped every table strictly by the logging-in user — two
fully separate, private budgets under one shared backend. That's now
reversed: the two users want **one shared budget** (same accounts, same
transactions, same categories, same monthly targets), because that's how
they actually manage money together — not two parallel personal budgets
that happen to run on the same server.

What has to change to support this (tracked as an issue, see §15):

- A **Household** becomes the real owner of Accounts/Categories/
  Transactions/Budgets/CategoryRules, replacing the current direct
  `userId` ownership on every table.
- **Users still log in individually** and still have their own identity —
  that doesn't go away, since attribution requires knowing who did what.
- Every **Transaction** gains a `createdByUserId` (or equivalent) distinct
  from the household it belongs to, so "who spent what" stays visible even
  though both users see the same transaction list. Same idea likely applies
  to Budget edits and Category creation, for the same reason (see the
  history/audit note below).
- Worth deciding explicitly: does "who added it" ever need a full history
  (who *last edited* a transaction, not just who created it), or is
  "created by" alone sufficient for now? Leaning toward created-by-only
  for v1 — a full edit history is easy to add later without a schema
  rework if it turns out to matter.
- **Full-visibility vs. per-account visibility** (open question, informed
  by competitive research in §12): the plan above assumes both users see
  everything in the household. Honeydue's model — partners link their own
  accounts but choose per-account what's visible to the other — is worth
  weighing against full shared visibility before committing, since it's a
  real, validated alternative pattern, not just full-share-or-nothing.

### 5b. Multi-household / invite design (feature-proofing, added 2026-09-11)

The two-person household above is the only one that will actually exist
for a while, but the schema and the invite flow are being designed now so
that **eventually sharing this app with other people needs zero rework** —
just more rows in the same tables, not a different data model.

- **Users↔Households is a membership relationship, not a single column.**
  Even though v1 only ever populates one household per user, modeling it as
  a `HouseholdMembers(householdId, userId, role)` join table instead of a
  `householdId` column directly on `User` means a user belonging to more
  than one household later (e.g., a shared budget with a partner *and* a
  separate one with a roommate) needs no schema change, just a UI for
  switching between households — which itself doesn't have to be built
  until it's actually needed.
- **Any user can create a new household**, becoming its first member —
  this is how someone starts their own independent budget rather than
  joining an existing one. Replaces today's model where "register" always
  means "join the one household this global invite code unlocks."
- **Invites become household-scoped, not global.** Today's single
  `INVITE_CODE` script property gates registration as a whole, with no
  concept of *which* household it grants access to (there's only one).
  That doesn't generalize — it needs to become: a household member
  generates an invite (code or link) tied to *that* household specifically;
  redeeming it joins the redeemer to that household, not "the app" in
  general. Worth building expiry and/or single-use into invites from the
  start, since "one forever-valid shared secret" stops being an acceptable
  model the moment this isn't just two trusted people.
- **Open question: member roles.** For two trusted partners, "anyone in
  the household can do anything" is fine. Once other people are involved,
  it likely matters whether every member can generate new invites (add
  more people) or remove other members, versus only the household's
  creator/owner being able to. Leaning toward adding a simple owner/member
  distinction at schema time now (cheap) rather than retrofitting it later
  (expensive) — even if v1's UI doesn't expose anything role-gated yet.
- Registration/login UI needs two distinct entry points once this lands:
  "create a new household" vs. "join a household via invite" — today's
  single undifferentiated register form doesn't distinguish these.

## 6. Proof of Concept Scope

The PoC's job is to prove the core loop end-to-end on a real phone: **log
in → import a credit card statement → see categorized transactions → see
spend vs. budget.** It intentionally cuts scope versus the full PRD below:

- **Platform:** React Native app via Expo, runnable on both iOS and Android. Standalone Android builds now ship via `eas build` (see §14); Expo Go used for fast iteration during development **until the E2EE work lands (§10a)** — `react-native-libsodium` is a native module, so iteration moves to a custom dev client (`expo-dev-client`) at that point.
- **Backend:** currently a Google Apps Script Web App bound to a Google Sheet acting as the database (see §14 for why, and §14a for why this is being migrated off). Each user's accounts/transactions/budgets are scoped to their login server-side today — moving to household-scoped per §5a.
- **Auth:** simple username + password login (hashed passwords, session token) gated by a shared invite code. Not production-grade auth (no OAuth/SSO, no password reset, no session expiry) — see §10 for the concrete gaps found in review. **Being replaced (§10a, decision 2026-09-15)** by Google Sign-In for login identity plus a separate vault passphrase for encryption, as part of the backend migration.
- **Import format:** CSV only for the PoC (most credit card issuers export CSV directly; OFX/QFX and PDF are deferred — see Non-Goals for full v1).
- **Categorization:** keyword-based default rules + manual override; per-user learned rules (moving to household-shared rules per §5a).
- **Budgeting:** one budget amount per category per month; actual-vs-budget view.
- **Manual entry:** in place — add a transaction directly (amount, category, optional description) from either the Transactions or Budgets screen, no statement required.
- **Out of scope for PoC:** OFX/QFX/PDF import, reconciliation-flagging dashboard, trend reports, CSV/PDF export, bulk re-categorization UI, subcategories, receipt photo capture (§8.6, roadmap).

## 7. User Stories

1. As a user, I can upload a bank statement file (CSV/OFX/QFX/PDF) and have its transactions added to the household's transaction list without duplicates.
2. As a user, I can see each transaction auto-assigned to a spending category, and correct it if it's wrong.
3. As a user, when I correct a category, I can save a rule so future transactions from that merchant categorize the same way automatically.
4. As a user, I can set a monthly budget per category and see actual vs. budgeted spend, updated as either of us imports statements or adds transactions.
5. As a user, I can see a reconciliation view that flags: duplicate transactions, uncategorized transactions, and transactions above a configurable threshold.
6. As a user, I can view spending history by category and month, and export it (CSV/PDF) for my own records.
7. As a user, I can mark a transaction as "reviewed" so I know I've already looked at it.
8. As a user, I can see who — me or my partner — added or imported a given transaction.
9. As a user, I can add a transaction manually in a few taps without needing a statement (built); eventually by just photographing a receipt, gas pump readout, or a Venmo request screenshot (§8.6, roadmap).

## 8. Functional Requirements (full v1 — beyond PoC)

### 8.1 Statement Import
- Support CSV upload with a column-mapping step (date, description, amount, optional balance) since issuer CSV formats vary.
- Support OFX/QFX parsing (standard bank/card export format) with no mapping needed.
- Support PDF statement upload with text extraction for issuers that only offer PDF statements; flag low-confidence extractions for manual review rather than silently guessing.
- Deduplicate transactions on import using date + amount + normalized description (+ statement source) to avoid double-counting overlapping statement periods.
- Support multiple accounts per household (multiple credit cards, plus savings/checking), each statement import tagged to an account.

### 8.2 Categorization
- Maintain a configurable category list (e.g., Groceries, Dining, Utilities, Transport, Entertainment, Income, Transfer), shared across the household (§5a) — creating/renaming a category is now built (rename added 2026-09-11); deleting one is not yet.
- Auto-categorize on import using: (a) household-defined merchant/description rules, (b) a default keyword-based ruleset shipped with the app, (c) fallback to "Uncategorized."
- Allow bulk re-categorization (select multiple transactions → assign category).
- Learn from manual corrections by prompting "Always categorize [merchant] as [category]?" and saving as a rule.
- **Split transactions (e.g. one grocery run: food vs. drinks) — raised 2026-09-16, under discussion, not designed yet.** Today a `Transaction` has exactly one `categoryId`; the ask is to let a single purchase span more than one category (part groceries, part alcohol, on one receipt) instead of forcing the whole amount into one bucket. Open questions:
  - **Data model**: does a `Transaction` gain a set of line items (each its own category + amount, summing to the transaction total) for split rows specifically, or is a "split" actually two-or-more ordinary transaction rows tied together (parent/child, or a shared `splitGroupId`)? These differ in how dedup, CSV re-import, and the `reviewed` flag apply — a line-item model keeps one dedup key per real-world purchase; a multi-row model needs a new way to dedup the group as a whole.
  - **Where a split gets created**: a CSV/statement line is one row with one amount, so a split can't be inferred from the source data — is it only ever a manual edit after import, or does the Add Transaction modal (manual entry) support entering a split directly too?
  - **Interaction with category rules**: today's rule is one merchant → one category (§8.2 above). A merchant that sometimes splits (a grocery run with wine) and sometimes doesn't doesn't fit that cleanly — does a split simply opt out of rule-based auto-categorization and always require manual entry, or does a merchant need its own "usually splits this way" template?
  - **Budget rollup**: each split portion should count toward its own category's actual spend in §8.3 (the natural reading) — needs to be explicit, since every existing actual-vs-budget query currently assumes one `categoryId` per transaction row.
  - **Raised explicitly as a scale concern, not just a v1 design detail**: as the household/multi-household model (§5a/§5b) grows the number of households, each with its own custom category list, a split-entry UI needs to hold up once a household has accumulated many custom categories (a searchable/filterable picker, not a short fixed list) — and there's no shared default template to lean on for "typically splits like this" once two households' category sets don't resemble each other at all.

### 8.3 Budgeting
- Allow setting a target budget amount per category per month. Each month starts from its own budget row (already the case in the data model — `Budget` is keyed by category + month), so a new month's transactions are automatically measured against that month's amount, not folded into a running total.
- **Rollover, as a per-category option** (not an all-or-nothing setting): a category can be marked to carry its unspent balance into next month's budget for that category, while other categories reset to their flat monthly amount. Needs a decision on how a category flips between the two modes, and what happens to a rolled-over balance if the category's budget amount itself changes month to month.
- **Deficit rollover (negative rollover) — raised 2026-09-16, under discussion, not designed yet.** The rollover bullet above only describes carrying forward an unspent *surplus*; this is the mirror case — if a category ends a month overspent, that deficit reduces next month's budget for the same category instead of resetting clean. Still open:
  - **Scope**: per-category deficit rollover (mirroring the per-category surplus rollover above), a household-wide total deficit/surplus, or both independently?
  - **Time horizon — the biggest open question here**: does a deficit roll forward one month at a time (this month's overspend hits only next month, then resets), or should the tracked figure actually be a running **year-to-date surplus/deficit** — "where does the household stand for the year so far" — rather than a single-month carry? These behave very differently: a YTD figure lets a good month recover from a bad one anytime over the rest of the year; a one-month carry hits exactly the following month and then disappears regardless of what happens after.
  - **Relationship to the surplus-rollover toggle above**: one on/off "rollover" switch per category that carries both directions symmetrically, or separate switches (someone may want to keep unspent grocery money without a bad grocery month permanently chasing next month)?
- **Variable/seasonal budgets**: since budgets are already per-category-per-month, a category can already be given a different amount in a specific month (e.g., a higher "Presents" budget in September/April/December for birthdays and Christmas) — that part works today. What's missing is a way to *plan* this ahead of time instead of re-entering it by hand each year: e.g., a recurring seasonal override template per category ("bump Presents to $X every September/April/December") that pre-fills those months automatically, with actual values still editable per month.
- **Custom one-off budget for a large purchase — raised 2026-09-16, under discussion, not designed yet.** Different from the seasonal bullet above, which is a category's *normal* recurring amount changing predictably in known months — this is instead a single ad-hoc budget for one specific large purchase (furniture, an appliance) that doesn't fit an existing category's normal monthly rhythm. Open questions:
  - Does it need its own category, or a distinct "one-time budget" object outside the category/month model in §9?
  - **How does it affect the household's monthly surplus/deficit** — counted inside the regular month's surplus/deficit math (so a big purchase can visibly wipe out that month), or tracked separately so it doesn't distort the read on "normal" monthly spending? Depends partly on how deficit rollover (above) is resolved.
  - If deficit rollover ships, does overspending against a one-time custom budget roll forward the same way a category deficit would, or is a one-time budget explicitly closed with no rollover at all?
- Support carrying over the previous month's *plain* budget amount as a starting point for the next (distinct from balance rollover above — this is just "don't retype the same number every month" for categories that aren't in rollover mode).
- Show actual vs. budget with variance ($ and %) per category, and a total.
- The existing "Left" figure in the Budgets screen's totals row is already the same idea as PocketGuard's most-praised feature, a real-time "Leftover" spendable amount (§12) — validates keeping it prominent rather than burying it, no new build needed here.

### 8.4 Reconciliation & Review
- Dashboard view flagging: possible duplicates, uncategorized transactions, transactions over a user-set threshold, and transactions with no matching budget category.
- **"Mark reviewed" state per transaction — pulled from the UI 2026-09-16, under discussion, not re-designed yet.** The per-row toggle shipped this session (§10a rewrite) but was pulled since it wasn't working as intended; the backend field/mutation are left in place, just nothing in the app surfaces it right now. Open questions before it comes back:
  - What does "reviewed" actually mean for a two-person household — a per-user flag (each person tracks their own review pass) or a single shared flag either person can set?
  - Should it live as an inline per-row toggle at all, or move into the §8.4 flagging dashboard (a bulk "review these N transactions" flow) instead of a control on every row?
- Running reconciliation total per account (sum of imported transactions) that the user can sanity-check against the statement's stated balance.
- A staleness warning when a manual-entry-only account hasn't had a statement import or manual entry in a while — Goodbudget's most-cited complaint (§12) is budgets silently "drifting" when manual entries get missed, and a shared household budget makes that worse (each person may assume the other is keeping it current).

### 8.5 Reporting
- **Monthly report**: a standing per-month summary (total spend, spend by category, budget variance, rollover balances carried in/out) that a user can look back at for any past month, not just the current one — effectively an archived snapshot rather than something recomputed only for "now."
- Trend view: category spend over time (last 3/6/12 months).
- Export transactions and summaries to CSV and PDF.
- Per-person breakdown, given §5a: how much of this month's spend did each household member enter, per category and in total.

### 8.6 Receipt & Photo Capture (roadmap, not started)

The goal: point the phone camera at a receipt, a gas pump's total, or a
screenshot of a Venmo request, and get a **pre-filled** Add Transaction
form (amount, likely category, a description guess) that still requires a
human tap to confirm — never a silent auto-commit, since OCR/vision
extraction is genuinely wrong often enough that blind trust would corrupt
the budget quietly.

- **Inputs to support**: a physical receipt photo, a gas station pump
  display photo (just needs the total, not itemization), and a screenshot
  of a payment app request/confirmation (Venmo, Zelle, etc. — these are
  already-digital text, likely the easiest of the three to extract
  reliably).
- **Extraction approach**: send the captured image to a vision-capable
  model to extract amount/vendor/date/(a category guess) as structured
  data, then populate the existing Add Transaction form fields for the
  user to review and confirm/edit before saving — reusing the modal that
  already exists rather than building a separate confirmation UI.
- **Category guess feeds the same categorizer** that already exists for
  statement imports (merchant rules + default keywords), rather than being
  a separate guessing mechanism.
- **Decision (2026-09-15): the receipt/gas-pump/screenshot image is
  consumed, not stored.** Only the extracted fields (amount, vendor,
  date, category guess) are saved to the transaction — the image itself
  is discarded once extraction completes, never persisted (not on the
  server, not in the household's encrypted data). This reverses the
  earlier plan to keep the image as a durable record (see §12's Monarch
  Money comparison, now not something we're matching) — smaller data
  footprint, nothing extra to encrypt/store/manage under §10a, at the
  cost of losing the "pull up the original receipt later" use case
  (tax records, disputing a charge).
- Explicitly **not** attempting full itemized receipt parsing (line items,
  tax breakdown) for v1 — just enough to log one transaction at the
  receipt's total.
- **Extraction location, resolved by §10a**: since the server must never
  see plaintext, and the image is transient (never persisted), it goes
  straight from device to wherever extraction happens — fully on-device,
  or a direct client-to-vision-API call — never proxied through our own
  backend.

## 9. Data Model (high level, post §5a/§5b household migration)

- **Household**: id, name (optional), createdAt.
- **User**: id, googleId, email, name, plus key-material fields for §10a (publicKey, encryptedPrivateKey, vaultKdfSalt, etc.) — **no `householdId` column** (see §5b: membership is a relationship, not a field on User, so one user can belong to more than one household without a schema change). Authoritative field list lives in `backend/prisma/schema.prisma`, kept ahead of this high-level summary.
- **HouseholdMember**: householdId, userId, role (`owner` | `member`), joinedAt — the join table that actually links users to households.
- **Invite**: id, householdId, code, createdByUserId, createdAt, expiresAt (nullable), usedByUserId (nullable) — household-scoped, replacing today's single global `INVITE_CODE`.
- **Account**: id, householdId, name, type (credit/checking/savings), institution.
- **Statement Import**: id, account_id, file type, imported_at, source filename, date range covered.
- **Transaction**: id, householdId, account_id, statement_import_id, date, description (raw + normalized), amount, category_id, reviewed (bool), notes, **createdByUserId**.
- **Category**: id, householdId, name, parent_category_id (optional, for subcategories).
- **Category Rule**: id, householdId, match_pattern (merchant/keyword), category_id.
- **Budget**: id, householdId, category_id, month, amount.

(Today's live schema, pre-migration, still scopes these by `userId` instead
of `householdId` and has no `createdByUserId` — see the actual schema in
`appscript/Db.gs`'s `HEADERS` for what's really deployed right now.)

## 10. Non-Functional Requirements

- **Security & privacy:** statement data is sensitive financial data. Concrete gaps found in this session's review, to close as part of the backend migration (§14a), not left as "someday":
  - Password hashing is a hand-rolled iterated-HMAC-SHA256 (Apps Script has no `bcrypt`/`scrypt`/`argon2`) — **superseded**: login moves to Google Sign-In (§10a), so there's no local password to hash at all; a separate vault passphrase still uses a real KDF (Argon2id) client-side for the encryption key, never sent to the server to hash.
  - Session tokens never expire and there's no logout-side invalidation — needs a TTL and a real logout action.
  - Data is **not** actually encrypted at rest today (a Google Sheet is not that) despite this being a stated requirement — a managed Postgres (most providers encrypt at rest by default) closes this as a side effect of the backend migration, not a separate task.
  - No general rate limiting beyond the login-lockout counter; registration itself has no throttling beyond the invite code.
  - Auth token currently rides in the JSON body, not an `Authorization` header — fine functionally, but header is the convention worth adopting on the new backend.
  - Never transmit statement files or parsed data to third parties. No live credential-based bank login, which sidesteps storing bank passwords entirely.
  - **The operator/developer cannot read user data even with full production database access** — a stronger bar than standard encryption-at-rest, requiring true end-to-end encryption. See §10a for the design this requires.
- **Data ownership:** a user can export or delete all their data at any time.
- **Accuracy:** parsing errors must be surfaced, not silently dropped — a failed row/transaction should be visibly flagged, not swallowed. Same principle applies to §8.6 receipt extraction — a low-confidence read gets flagged for the user to fix, not silently guessed.
- **Performance:** importing a typical monthly statement (50–300 transactions) should complete in a few seconds. **Not currently true** — see §14 for why, and §14a for the fix.

### 10a. End-to-end encryption & zero developer access (decision, 2026-09-15)

Explicit new requirement: household financial data must be unreadable by
the app operator/developer, not just outside attackers — even with full
production database access. This goes beyond "encrypted at rest" (any
managed Postgres provider gives that for free) to encryption the *server
itself* cannot reverse.

- **Login identity and the encryption secret are deliberately two different
  things (decision, 2026-09-15)**: **Google Sign-In** authenticates who a
  user is (verified server-side via Google's own ID-token signature — no
  local password verifier needed at all), while a separate **vault
  passphrase**, entered only in the app and never transmitted to the
  server in any form, is what derives the key that unlocks a user's
  private key below. If Google alone could unlock the vault, "the
  developer can't read your data" would quietly become "neither can the
  developer, unless they also control your Google account" — a weaker
  guarantee. Keeping the two independent means only someone who knows the
  vault passphrase can ever decrypt anything, Google account access
  notwithstanding.
- **Household Data Encryption Key (DEK)**: one symmetric key per household,
  generated client-side at household creation, encrypts all sensitive
  fields (transaction amount/description, category names, budget amounts,
  receipt images per §8.6) before they ever leave the device. The server
  stores only ciphertext plus the minimal plaintext metadata needed to
  route/list rows (ids, timestamps, householdId, accountId) — never
  content.
- **Key sharing across members**: each user generates a public/private
  keypair on first signup (private key encrypted with a key derived from
  their vault passphrase, stored as an opaque blob server-side so it can
  follow them to a new device on login). Inviting a member (§5b) means an
  existing member decrypts the household DEK locally and re-encrypts
  ("wraps") it to the new member's public key (libsodium sealed boxes) —
  the server only ever relays the wrapped blob, never the DEK itself.
- **No server-side computation on plaintext.** Budget totals, category
  sums, trend reports (§8.5), and reconciliation flags (§8.4) all move to
  being computed **client-side** after fetching and decrypting the
  relevant rows — the backend can no longer do this work, since it never
  holds the DEK. Acceptable at household-scale transaction volumes (tens
  to low hundreds of rows/month); would need revisiting if usage ever grew
  far beyond a household.
- **Account recovery (decision, 2026-09-15)**: a **recovery code** is
  generated at signup — a second wrapped copy of the household DEK the
  user is responsible for storing themselves (password manager, printed,
  etc). Losing both the vault passphrase and the recovery code means that
  member's access is unrecoverable (other members keep theirs, and the
  household's data itself isn't lost) — a deliberate tradeoff for a
  self-service recovery flow that doesn't depend on another member being
  available. Note Google account recovery is irrelevant here — regaining
  Google access doesn't help if the vault passphrase itself is lost, by
  design.
- **Re-entering the vault passphrase every session — raised 2026-09-16, under discussion, not designed yet.** The private key only ever lives in memory (never persisted, by design), so every cold app start means retyping the vault passphrase, which held up the off-network demo build in practice. The ask: let a device remember it (e.g. behind the device's own biometric/PIN lock via Android Keystore) so it's a one-time-per-device setup, not a type-it-every-time flow. Open questions before this is designed:
  - **What actually gets cached on-device**: the passphrase itself, the derived vault-unlock key, or the already-decrypted private key — each has a different exposure window if the device is later compromised, and picking one is a real security tradeoff, not just an implementation detail.
  - **Does this weaken the §10a threat model?** The whole point of the vault passphrase is that it's the one thing never persisted anywhere. Caching it (in any form) behind the device's screen lock is a different, weaker guarantee than "only in the user's head" — needs an explicit decision that this tradeoff is acceptable, not something that quietly ships as a UX nicety.
  - Is this opt-in per device, or the default going forward? A shared household device likely wants this off; a personal phone likely wants it on.
- **Open question, not yet resolved**: removing a household member (once
  that flow exists) doesn't automatically revoke their ability to decrypt
  data they already synced locally, and doesn't rotate the household DEK
  — a real gap for later, not blocking for a 2-person trusted household
  today. Tracked in §15.
- **Library**: `react-native-libsodium` (native module) on the Expo app
  for all key generation/wrapping/encryption — decided 2026-09-15 over a
  pure-JS alternative for better performance and to match libsodium's
  well-audited sealed-box/secretbox/Argon2id primitives directly, at the
  cost of requiring a custom dev client (`expo-dev-client` + an `eas
  build` dev profile) for iteration instead of Expo Go going forward. The
  server does none of this — it never holds key material, so it only
  needs `google-auth-library` to verify Google ID tokens, not a crypto
  library.

### 10b. Client-side caching & prefetch (decision, 2026-09-15)

To keep the app feeling instant regardless of backend cold-start behavior
(see §14a's hosting decision):

- **Cache-first render**: on launch, render immediately from the
  last-known decrypted data already sitting in local on-device storage —
  no waiting on a network round-trip to show *something*.
- **Background refetch**: fetch fresh encrypted data in parallel, decrypt
  client-side, and update the UI when it lands (stale-while-revalidate),
  rather than blocking the initial render on it.
- **Prefetch for navigation**: while a user sits on one screen, quietly
  prefetch the data for likely-next screens (e.g. Transactions while on
  Budgets home) so navigating there feels instant too.
- Likely implementation: TanStack Query (React Query) with a persisted
  cache (AsyncStorage/MMKV), which supports this pattern (cache-first
  render, background refetch, `prefetchQuery`) without much custom
  infrastructure.
- This makes backend cold-starts mostly invisible on repeat app opens —
  only a genuinely first-ever launch (empty cache) waits on the network.

## 11. Success Metrics

- % of imported transactions auto-categorized correctly (target: >85% after ruleset matures).
- Time from "download statement" to "fully reconciled" (target: under 5 minutes/month/account).
- Reduction in manually-entered transactions vs. current spreadsheet workflow (target: near zero manual entry) — though see §3: manual entry being *fast* is now its own goal, not just something to minimize, since some spending will never come from a statement.

## 12. Competitive Landscape

Reviewed YNAB, Copilot Money, Monarch Money, Honeydue, Zeta, Goodbudget,
EveryDollar, PocketGuard, and Simplifi (Quicken), focused on shared/couples
budget models, receipt capture, and quick-add mechanics.

**Shared/couples budget models** — two real patterns exist, not more:
(a) **single shared pool everyone sees fully** (Simplifi: partners share
access to one Spending Plan, auto-generated from income minus bills and
re-adjusted live as you spend), or (b) **linked-but-visibility-controlled
per account** (Honeydue: partners link their own accounts but choose
per-account what the other partner sees, with a combined dashboard on top).
Honeydue is the closer fit to our "own accounts, shared budget, track
who-puts-in-what" goal — worth folding **per-account visibility as an open
design question for §5a**, not just full-visibility-by-default. Honeydue's
well-known weakness: it's a tracking layer with no real budgeting
methodology underneath (no envelope/zero-based logic) — validates that we
shouldn't stop at attribution alone. Goodbudget's envelope model
(rollover, explicit "share with partner") independently validates the
per-category rollover already on our roadmap (§8.3) — and its most-cited
complaint (manual-entry-only causes budget "drift" when entries are
missed) is a real risk for our own manual/CSV-hybrid model too, worth a
stale-data warning somewhere in the UI.

**Receipt/photo capture** — Monarch Money is the clear leader here: it
extracts merchant/amount/date via AI *and* stores the receipt image itself
attached to the transaction as a durable record (useful for tax/dispute
purposes later). YNAB, Copilot, PocketGuard, and Rocket Money all skip
image persistence entirely, same as we've decided to (§8.6, 2026-09-15) —
we're matching the majority here (extract-then-discard), not Monarch's
approach, a deliberate tradeoff against §10a's smaller-data-footprint
preference under end-to-end encryption.

**Quick-add / low-friction entry** — no reviewed app does Venmo-screenshot
or SMS-parsing quick-add well; that's a genuine differentiation opportunity
for us, not something to just match. PocketGuard's signature, most-praised
feature is a real-time **"Leftover" number** (spendable-after-bills amount)
— worth considering as a headline stat on the Budgets home screen,
alongside (not instead of) per-category budget-vs-actual. Goodbudget users
frame manual entry's forced awareness as a genuine *positive* versus
auto-sync eroding budget discipline — reassurance that our manual/CSV-
hybrid approach isn't inherently inferior, just a different tradeoff worth
keeping rather than "fixing" toward full auto-sync later.

**Other notable ideas**: Simplifi's proactive bill/subscription alerts and
category-specific spend alerts ("food delivery over $X this month");
PocketGuard's 70+ preset categories (our 11 defaults + custom creation
already follow the same shape). Widely-cited complaint about Goodbudget:
UI feels dated next to newer competitors — worth keeping in mind for our
own polish pass, not a feature gap.

## 13. Milestones

- **M0 — PoC (done):** Expo app + shared backend, login, CSV credit-card import, categorization, budget vs. actual — see §6.
- **M1 — Import & Categorize (full):** OFX import, PDF import, dedup hardening, bulk re-categorization. Split transactions (§8.2) is a candidate here too, pending the open data-model questions there.
- **M2 — Budgeting:** per-category rollover option, seasonal budget templates (e.g. recurring Sept/Apr/Dec "Presents" bump), carry-forward of flat budget amounts, multi-account rollups. Deficit (negative) rollover and one-off custom budgets for large purchases (§8.3) are candidates for this milestone too, but need the open design questions there resolved first — not yet scoped.
- **M3 — Reconciliation & Reporting:** flagging dashboard, monthly report archive, trend reports, exports, per-person breakdown.
- **M4 — Backend migration (§14a):** off Apps Script/Sheets onto a real HTTP host + database, with the security hardening in §10 as part of the same move.
- **M5 — Shared household model (§5a):** household-scoped data, per-transaction attribution, household-aware invite/registration.
- **M6 — Receipt & photo capture (§8.6).**
- **M7 (stretch) — push notifications for large transactions, iOS standalone build (§14).**

## 14. Backend & Platform History

- ~~Where should the backend run?~~ **(2026-09-09)** Google Apps Script Web App bound to a Google Sheet acting as the database — see `appscript/` and the top-level `README.md`. Chosen specifically so neither user needs a computer to stay on.
- ~~Expo Go vs. app-store-style distribution?~~ **(2026-09-11)** Standalone builds via `eas build` (Android APK sideload first; iPhone needs a paid Apple Developer account, not done yet).

### 14a. Why the backend is being migrated off Apps Script (decision, 2026-09-11)

Extensive real-world testing this session surfaced hard limits in Apps
Script's Web App model that aren't fixable from our side:

- **Every response is delivered via a redirect to a second, one-time URL**
  (`script.google.com` → `script.googleusercontent.com`) rather than a
  normal HTTP response body. That hop has proven unreliable in practice —
  confirmed from curl, PowerShell, *and* the live app alike, so it isn't a
  client bug — occasionally landing on a 404 page, and at least once on our
  own unrelated health-check text instead of the real response. Retries
  and idempotency fixes reduced the damage (see git history 2026-09-11) but
  can't eliminate a platform-level reliability ceiling.
- **The Web App deployment's "Who has access" setting has repeatedly
  reverted** away from public access — sometimes after a redeploy,
  sometimes with no redeploy at all — and Google's own Apps Script REST API
  has no field to set it programmatically (confirmed against the official
  API reference), so there's no way to fix this from code at all, only by
  hand in the editor UI after the fact.
- **No real query/index model** — every read is a full-tab scan
  (`SpreadsheetApp.getDataRange().getValues()`), mitigated this session
  with server-side caching (`CacheService`) for rarely-changing data and a
  client-side cache for the same, but transactions/budgets still can't be
  queried, only fully scanned and filtered in memory — a real problem once
  the household model (§5a) doubles the effective data volume per account.
- **`LockService` originally serialized every request, reads included** —
  fixed this session (reads no longer take the lock), but writes still
  fully serialize, which matters more once two people are actively using
  one shared household dataset instead of two independent ones.

**Target replacement**: Express on Render, Postgres on Neon — decided
2026-09-15 after evaluating free-tier options hands-on (Fly.io no longer
offers a free tier for new accounts as of 2026; Railway's free allowance is
a few hours of trial credit, not persistent hosting). This also directly
resolves the §10 security gaps (real password hashing, session expiry) as
one migration rather than three separate efforts, and — per §10a — the
server now only ever stores/relays ciphertext, going beyond the original
"encrypted at rest" bar. The already-open Google OAuth access plan
(`feature/google-oauth-access` branch, issue #2) is **superseded** by this
decision — there's no more "Apps Script access setting" to fix once the
backend isn't Apps Script.

**Cold-start handling (revised, 2026-09-15)**: Neon's free-tier compute
scales to zero after 5 min idle but wakes in under a second — not a
concern. Render's free web service spins down after 15 min idle and takes
~1 minute to wake. Originally planned to mask this with an external cron
ping (e.g. cron-job.org hitting `/health` every 14 minutes) — **deferred**
in favor of shipping the client-side cache-first UX (§10b) first and
seeing whether that alone makes cold starts unnoticeable in practice
before adding the ping's own cost (burns nearly the entire 750
instance-hour/month free-tier budget, leaving no room for a second free
service). If §10b's caching isn't enough on its own, the ping (or
Render's ~$7/mo paid tier, which removes spin-down entirely) is still the
fallback.

**Dev/production branch split (decision, 2026-09-15)**: a Neon **branch**
called `dev` (not a separate project — branches are free, copy-on-write
clones with their own connection string) is what local development,
manual device testing, and the Jest suite all point at via
`backend/.env`. The original branch is reserved as the eventual
production database, staying empty until real household data exists —
avoids mixing throwaway test households/transactions with real ones from
day one, cheap to set up now versus untangling later.

## 15. Open Questions

- **Split transactions (§8.2, raised 2026-09-16)**: line-items-on-one-row vs. linked multiple rows — needs deciding before any schema work, since it changes how dedup and budget rollup both work. Also needs a stance on whether split entry is manual-only or something the Add Transaction modal supports directly.
- Which card issuers need to be supported first (determines CSV format variety)?
- Rollover is wanted as a **per-category option**, not a global setting — still open: how does a category switch modes, and what happens to an already-rolled-over balance if that category's flat amount later changes?
- **Deficit rollover (§8.3, raised 2026-09-16)**: is it a one-month-at-a-time carry of last month's overspend, or should "deficit" actually mean a running year-to-date surplus/deficit figure for the household? These are different features, not different settings on the same feature, and need to be decided before design starts.
- **Custom one-off large-purchase budget (§8.3, raised 2026-09-16)**: does it live in the category/month budget model or as its own object, and does it count toward or sit outside the month's regular surplus/deficit total? Depends on how deficit rollover above is resolved.
- **"Mark reviewed" (§8.4, pulled from the UI 2026-09-16)**: per-user or shared-per-household flag, and does it belong on every transaction row or only in a bulk review flow off the flagging dashboard?
- **Device-remembered vault passphrase (§10a, raised 2026-09-16)**: what's actually cached (passphrase, derived key, or decrypted private key) and whether caching anything behind device biometrics is an acceptable weakening of "never persisted anywhere" — needs a decision, not just a convenience implementation.
- Seasonal budgets already work manually (set a different amount for a category in a given month) — open: what does a reusable "recurring seasonal override" template actually look like (which months, which categories, does it auto-apply or just pre-fill for review)?
- Monthly reports: archived snapshot per past month, or always recomputed live from current data? Affects whether a later edit to a past transaction should retroactively change an old month's report.
- §5a: is "created by" alone enough attribution, or will a fuller edit history matter later?
- §10a: removing a household member doesn't yet revoke their previously-synced local access or rotate the household DEK — needs a design before a member-removal flow ships (not blocking today's 2-person trusted household).
