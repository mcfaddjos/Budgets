# Plan: Move Web App access to "Anyone with Google account" + real Google Sign-In

## Context

The Apps Script Web App deployment's access setting keeps reverting away
from "Anyone" — sometimes after a `clasp redeploy`, sometimes on its own
with no redeploy at all. This isn't a clasp bug or something in our control:
Google's own REST API for Apps Script deployments doesn't expose a field
for the Web App access level at all — it's UI-only, undocumented, and has
proven unreliable to keep pinned at "Anyone" (fully public, no Google
account required).

Rather than continuing to manually reset it after every deploy, this plan
switches to the access level it appears to actually want to land on:
**"Anyone with Google account."** That was already the stated long-term
goal (real auth instead of the invite-code stopgap) — this makes it the
immediate goal instead of something to revisit later.

## What changes

- **Deployment access**: `Anyone` → `Anyone with Google account`. Only a
  signed-in Google account can reach the Web App at all; the app no longer
  needs to fight to keep the deployment publicly open.
- **Client auth**: the app currently sends `{action, token, payload}` where
  `token` is our own session token from `auth.login`/`auth.register`. That
  whole flow (`Users` sheet, password hashing, invite codes, lockouts) gets
  replaced by a real Google Sign-In — the app obtains a Google OAuth token
  and sends it as `Authorization: Bearer <token>` on every request. Apps
  Script's access gate handles rejecting anyone not signed in; our own code
  only needs to know *which* signed-in Google account made the call.
- **Server identity model**: instead of looking up a user by session token
  in a `Sessions` sheet, the server needs to know the caller's Google
  account email. **This is the one real open technical question — see
  "Must be verified first" below** — and it determines whether the rest of
  this plan is straightforward or needs a different shape.

## Must be verified first (spike, before committing to the rest)

`Session.getActiveUser().getEmail()` is the obvious way to read the
caller's identity inside the script, but it's known to be unreliable for
consumer (non-Workspace) Google accounts and depends on the deployment's
`executeAs` setting:

- `executeAs: USER_DEPLOYING` (current setting) — the script always runs as
  the deploying account regardless of caller, which is *why* `Session.
  getActiveUser()` may come back empty for the caller — the "active user"
  context isn't guaranteed to be populated just because access requires a
  Google account.
- `executeAs: USER_ACCESSING` — the script runs as *each caller's own*
  Google identity instead. `getActiveUser()` becomes reliable, but this
  changes the security/permissions model: the script's access to the
  "Budgets DB" spreadsheet would then run as the caller, not the owner —
  meaning the second user would need to be given direct Editor access to
  the spreadsheet (share it with their Google account), not just "allowed
  to run the script." Worth confirming this is acceptable before building
  around it.

**First task on this branch**: a minimal test deployment that logs what
`Session.getActiveUser().getEmail()` actually returns under each
`executeAs` setting, called from the real app (not curl/PowerShell, since
those don't carry a Google session the same way a signed-in mobile client
would). Everything else below assumes this resolves cleanly; if it doesn't,
this plan needs a different identity mechanism (e.g., verifying a Google
ID token's claims manually instead of relying on `getActiveUser()`).

## Client changes (`app/`)

- Add Google Sign-In — most likely `expo-auth-session` with Google's OAuth
  provider (`AuthSession.useAuthRequest` + Google's discovery document),
  since it works across both Expo Go dev testing and the EAS standalone
  build without a native module swap.
- Requires **OAuth client registration in Google Cloud Console** (user's
  own step, needs the Google account that owns the Apps Script project):
  - An **Android** OAuth client, tied to the app's package name
    (`com.mcfaddjos.budgets`) *and* the SHA-1 certificate fingerprint of
    whatever keystore signs the build. Since the current APK uses an
    EAS-managed keystore, the fingerprint comes from `eas credentials`.
    **Any keystore change later means re-registering this.**
  - An **iOS** OAuth client (bundle ID), once the iPhone build happens —
    not blocking for the Android-first rollout.
- Replace `LoginScreen`'s username/password/invite-code form with a single
  "Sign in with Google" button. `client.js`'s `call()` sends the Google
  ID/access token instead of our own session token; drop `setToken`/
  `AsyncStorage` token persistence in favor of whatever `expo-auth-session`
  already persists (or keep AsyncStorage for the Google token — same
  self-healing pattern as today, just a different token source).

## Server changes (`appscript/`)

- `Auth.gs`: replace `handleRegister_`/`handleLogin_`/`handleMe_`,
  password hashing, invite-code check, and the `Users`/`Sessions` sheet
  tabs with: read the caller's email (per the spike above), look up or
  create an app-level user row keyed by that email instead of a
  username/password.
- **Data migration for the two existing accounts**: current `Users` rows
  are keyed by an internal UUID, with `Accounts`/`Categories`/
  `Transactions`/`Budgets` all referencing `userId`. Once identity is
  email-based, either (a) add an `email` column to `Users` and map the two
  existing accounts to their Google emails once, keeping the existing
  `userId` and all downstream data intact, or (b) re-key everything by
  email directly. (a) is much less disruptive — preserves all existing
  transactions/budgets/accounts without touching every other table.
- `Code.gs`: `PUBLIC_ACTIONS` (`auth.register`, `auth.login`) goes away
  entirely — there's no unauthenticated action left once Google's access
  gate handles that at the platform level. `debug.logs` staying reachable
  without our own session token is still fine/desirable (still gated by
  Google account access).
- Deployment manifest (`appsscript.json`): `webapp.access` →
  `ANYONE_WITH_GOOGLE_ACCOUNT` (or whatever the manifest's actual accepted
  value is — needs checking against Apps Script's manifest reference,
  since this field is separate from the deployment-level access setting
  that's been reverting) and revisit `executeAs` per the spike above.

## Rollout

1. Spike: confirm `getActiveUser()` behavior (see above) — go/no-go for the
   rest of this plan as written.
2. Register the Android OAuth client in Google Cloud Console.
3. Build the sign-in flow client-side; keep the old username/password path
   working in parallel behind a flag until sign-in is proven end-to-end
   (don't rip out the working auth before the replacement is confirmed).
4. Migrate `Auth.gs` to email-based identity; migrate the two existing
   accounts' `Users` rows.
5. Flip deployment access to "Anyone with Google account"; remove the old
   auth path once confirmed working from both phones.
6. iOS OAuth client + sign-in, once the iPhone build happens.

## Out of scope for this branch

- The iPhone standalone build itself (separate, gated on the Apple
  Developer Program decision already discussed).
- Any UI/feature work unrelated to auth — keep this branch focused on the
  access-model change so it's reviewable on its own.
