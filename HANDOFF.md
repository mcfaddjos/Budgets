# Session handoff — Budgets (2026-09-16, Windows → Mac migration)

Written specifically because development is moving to a Mac for iOS work.
Condensed state of the world so a fresh session (on either machine) can
pick up without re-deriving it. Repo: `mcfaddjos/Budgets`, branch `main`
(the long-lived `feature/backend-migration` branch was merged and can be
considered dead history now).

## Direction this session

Two earlier handoffs (see `PRD.md`'s own history) got the E2EE rewrite to
"registered and demo-seeded on one device, over LAN." This session took
it from there to **actually deployed and demo-ready off any network**,
then kept going: removed the vault passphrase entirely (§10c), added
account ownership, fixed a real UI bug backlog, and shipped Settings +
dark mode + a scalable Reports tab. It was one long continuous session —
everything below is one day's work, 2026-09-16.

## Where things stand

### Deployment (new this session)

- **Backend is live on Render**: `https://budgets-backend-rtl1.onrender.com`,
  free tier (spins down after 15 min idle, ~1 min cold-start wake — the
  app's loading screen already accounts for this, see below).
  `render.yaml` at repo root defines it; Render auto-deploys on every
  push to `main`, running `prisma migrate deploy` as part of the build.
- **Neon has two branches in real use now**: `dev` (local backend `.env`,
  Jest integration tests) and the production branch (what Render's
  `DATABASE_URL`/`DIRECT_URL` env vars point at). They're genuinely
  separate data — the production branch has its own real household, not
  a copy of `dev`'s seed data.
- **Android release APK**: built locally via `cd app/android && ANDROID_HOME=... JAVA_HOME=... ./gradlew assembleRelease`
  (no EAS) — the release build type is already configured to sign with
  the project's own `debug.keystore` (RN template default), the same one
  already registered in Google Cloud Console (SHA-1
  `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`) — so
  Google Sign-In works with zero GCP changes. This is genuinely
  standalone: JS bundle embedded, no Metro, no dev-client, works on any
  network. Installed on a physical Galaxy S24 via `adb install -r`.
- **App version is `1.0.0`** across `app.json`/`package.json`/Android
  `versionName` — established this session as the v1.0.0 demo baseline.
  **Standing instruction from the user**: always ask what version to
  publish as before any future prod-facing publish (Render deploy or a
  release build intended for real use) — don't just pick a number.

### §10c: passphrase-free unlock (decision + built, supersedes the old vault-passphrase UI)

The vault passphrase (typed, memorized) is **gone** — replaced by a
random secret generated once per device and held in `expo-secure-store`
(Android Keystore/iOS Keychain, encrypted at rest). Applies to the
household creator and invited members alike, not just invitees.
`LoginScreen`/`UnlockScreen` have no passphrase fields at all anymore;
login/create/join/unlock are all silent.

- `app/src/crypto/deviceSecret.js`: `getOrCreateVaultSecret()`.
- No biometric/PIN gate on top of the stored secret yet (deferred —
  `requireAuthentication` support is inconsistent enough across Android
  versions to risk flakiness without a device matrix to test against).
- **Real known gap, discovered while building this**: there is **no
  recovery-code redemption flow anywhere in the app**. A recovery code is
  generated and shown once at signup (`RecoveryCodeModal.js`), but
  nothing ever reads one back in. Before this session, that was already
  true but less consequential (a typed passphrase worked on any device).
  Now, a lost/reset device has **no way back into an account at all** —
  this is the single most important gap to close next, probably before
  much more feature work. It'd need: a new keypair generated on the new
  device, a way to submit the recovery code to unwrap the existing
  household DEK, and a backend action to replace the user's stored key
  material (`encryptedPrivateKey`/`publicKey`/etc.) — none of that backend
  support exists yet either.

### Account ownership (new this session)

`Account.ownerUserIds` (`String[]`, plaintext — a list of member user
ids, not financial content) — one owner for a personal account, more
than one for something shared. `accounts.create` validates every id is
actually a household member. New `auth.listMembers` action (full roster,
not just pending-grant members) backs the owner picker in
`AccountsScreen.js`.

### Settings, dark mode, Reports (new this session — biggest UI change)

- **Household management moved into Settings** (gear icon, top-right;
  replaces the old inline "Log out" text in the top bar). Invite
  creation, the pending-access-grant list, and the admin seed tool all
  live there now. The standalone Household tab is gone.
- **Dark mode**: `app/src/theme/palette.js` (light unchanged, dark
  deliberately muted/off-tone per explicit preference — not true
  black/true blue), `app/src/theme/ThemeContext.js`
  (`ThemeProvider`/`useTheme`/`useThemedStyles`, persisted via
  AsyncStorage). Applied across the whole app via `useThemedStyles`,
  which merges a small per-screen `darkStyles` override object onto the
  existing light `StyleSheet` rather than requiring a full rewrite. A
  few inline color literals still ignore the theme (Budgets' progress
  bar fill color, the surplus/deficit stat color) — cosmetic, logged, not
  fixed yet.
- **Feedback**: a "Send Feedback" button exists in Settings but isn't
  wired up — tapping it shows a "not built yet" alert. This is now the
  established pattern for shipping visible placeholders ahead of the
  real feature, per explicit instruction.
- **Reports tab** (replaces Household): one report shown at a time via a
  picker chip row; each report is a self-contained component owning its
  own data-fetching and its own settings/filters (`app/src/reports/registry.js`
  is the only thing touched to add a new one). Four built so far:
  Spending by Category, Year-to-Date Surplus/Deficit, Category Spend
  Trend (6 months), Day by Day Spending (a **real connected line chart**
  via `react-native-svg`, not a bar substitute — the one report that
  needed it). Shared pieces: `Bar.js`, `LineChart.js`, `Chip.js`,
  `MonthNav.js`. Three more reports are cataloged in PRD §8.8 as roadmap
  (budget variance ranking, per-person breakdown, account breakdown) —
  not designed in detail yet.
- Category chart colors: a fixed 8-hue palette
  (`app/src/theme/chartColors.js`) validated against this app's actual
  light/dark surfaces using the **dataviz skill's** six-check script —
  worth knowing that skill exists and what it checks (CVD-safe adjacent
  pairs, contrast, etc.) before adding more chart colors.

### Bug fixes this session (roughly chronological)

- Cold-start white screen with zero feedback while `AuthContext` checks
  for an existing session — added a loading spinner that upgrades its
  message after 4s ("Waking up the server…") since Render's free-tier
  cold start can take up to a minute.
- `LoginScreen`'s minimum-passphrase-length check applied to `login` mode
  too, not just create/join — meant a passphrase created under looser
  rules (the old dev-only 4-char default) could never log back in
  through a release build. (Moot now that passphrases are gone entirely,
  but the underlying lesson — a validation rule scoped too broadly —
  is worth remembering.)
- User's `name`/`email` could get stuck permanently null if the Google ID
  token happened to omit those claims on the one call that mattered
  (registration). `auth.login` now re-checks and backfills them from the
  fresh token on every login, since Google doesn't guarantee those claims
  on every token.
- Keyboard covering text inputs in multiple places (`AccountsScreen`'s
  add-account form, `AddTransactionModal`, `BudgetsScreen`'s two dialogs)
  with no dimmed backdrop consistency. Fixed via a shared `FormModal.js`
  (dimmed backdrop + `KeyboardAvoidingView` + `ScrollView` so long
  content scrolls instead of overflowing). Hit an Android-specific
  gotcha along the way: `KeyboardAvoidingView`'s `"height"` behavior
  double-applies on top of the Activity's own `windowSoftInputMode:
  adjustResize`, leaving a gap where the screen behind the modal peeked
  through above the keyboard — fixed by using `behavior={undefined}` on
  Android inside `FormModal` (letting `adjustResize` alone handle it),
  keeping `"padding"` on iOS.
- Tab bar crowding the version-footer text at the bottom of the screen —
  added bottom padding to `TabBar`.
- Dark mode's accent blue read as too purple — retuned to a more
  teal-leaning blue (`#3d84a8` dark / unchanged `#1a6ed8` light).
- Report picker chips and month-nav arrows were oversized on first pass —
  extracted shared `Chip.js`/`MonthNav.js` components specifically so
  sizing only needed tuning in one place.

### Native dependencies added this session

`expo-secure-store` (device secret storage, §10c) and `react-native-svg`
(the Day by Day line chart) — both required a `npx expo prebuild
--platform android` regeneration + a full native Gradle rebuild (not
just a JS-only `assembleRelease`), since they're native modules. **This
matters for the Mac/iOS side**: the equivalent iOS native linking
(CocoaPods `pod install`, etc.) hasn't been done or tested at all yet —
that's real, unverified work still ahead, not just "run `eas build`."

## What's still needed

1. **Recovery-code redemption flow** (see §10c above) — arguably the
   most urgent gap now, not iOS. Losing a device currently means losing
   that account, full stop.
2. **iOS build** — this is the actual point of migrating to a Mac. Per
   PRD §10 (`react-native-libsodium` is native), Expo Go won't work;
   needs a custom dev client the same way Android does, but built via
   Xcode locally (free Apple ID, personal-team signing, 7-day expiry, no
   TestFlight) or via EAS cloud build + a paid Apple Developer account
   ($99/yr) if you want TestFlight/no-Mac-required workflow. Nothing
   iOS-specific has been attempted yet — no Xcode project verified, no
   provisioning, no confirmation the native deps (libsodium,
   secure-store, svg, google-signin) build cleanly on iOS at all.
3. Real admin-vs-member permissions, "leave a household," and a broader
   household-management screen — all explicitly deferred this session
   (PRD §5c), reusing only the existing OWNER/MEMBER role for one narrow
   thing (the admin seed-tool visibility).
4. Platform-level (cross-household) admin — explicitly roadmap-only,
   needs a real design conversation before anything gets built (PRD §5d).
5. The three uncataloged... — see PRD §8.8 for the 3 not-yet-built report
   types (budget variance ranking, per-person breakdown, account
   breakdown), plus day-of-week spending clustering as a distinct idea
   from the day-of-month report that shipped.
6. A biometric/PIN gate on top of the device-bound secret (§10c) — punted
   for reliability reasons, needs a device matrix to test against first.

## Local-only files (gitignored, won't survive `git clone` onto the Mac)

- `backend/.env` — `DATABASE_URL`/`DIRECT_URL` (Neon **dev** branch),
  `GOOGLE_CLIENT_ID`, `PORT`. Only needed if running the backend locally
  on the Mac too; otherwise the Mac's app can just point straight at the
  Render URL and skip standing up a local backend at all.
- `app/.env` — `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`,
  `EXPO_PUBLIC_SERVER_URL`. For the Mac, simplest is
  `EXPO_PUBLIC_SERVER_URL=https://budgets-backend-rtl1.onrender.com/api`
  from the start rather than standing up a local LAN backend again.
  `.env.example` in both places documents every value.
- `app/android/app/debug.keystore` is committed (it's the RN template's
  own file, not machine-specific) — irrelevant to iOS anyway, mentioned
  here only so it isn't mistaken for something that needs recreating.

## Where to actually start on the Mac

1. `git clone` the repo, recreate the two `.env` files above (pointing
   `app/.env` at the Render URL, skip standing up a local backend
   unless you specifically want to).
2. `cd app && npm install`, then `npx expo prebuild --platform ios` to
   generate the Xcode project for the first time — this is genuinely
   untested territory, budget time for native build issues (CocoaPods
   versions, libsodium's iOS build, etc.) the way the Windows/Android
   side hit its own (see PRD's Gotchas history).
3. Decide free-Apple-ID-local-signing vs. paid-account-plus-EAS before
   spending time on either path — see the conversation this session had
   about that tradeoff (weekly re-signing + Mac-only vs. $99/yr +
   TestFlight + can build from anywhere).
