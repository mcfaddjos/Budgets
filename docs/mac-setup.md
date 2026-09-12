# Continuing development on a Mac

Everything in this repo is cross-platform (Node/Expo/React Native), so a
Mac works fine — and gets you two things Windows couldn't: a real iOS
Simulator (via Xcode) and a smoother Android emulator experience. This doc
covers cloning, running the app, Android dev on Mac specifically, and the
Apps Script/EAS tooling that needs a fresh login on a new machine (auth
tokens are per-machine, not shared via git).

## 1. Clone the repo

```bash
git clone https://github.com/mcfaddjos/Budgets.git
cd Budgets
git checkout claude/budget-tool-prd-bank-reconciliation-ek7r2e
```

That's the branch with all current work. The backend-migration scaffold
(Postgres/Prisma/Express, see `docs/backend-migration.md`) lives on a
separate branch: `feature/backend-migration`.

## 2. Node

Install via [nvm](https://github.com/nvm-sh/nvm) (avoids Homebrew's Node
fighting with anything else):

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
nvm install 24
nvm use 24
```

This project was developed against Node 24 — should match closely for the
Expo/Metro tooling to behave the same as it did on Windows.

## 3. Run the app (`app/`)

```bash
cd app
npm install
npx expo start
```

- **iOS Simulator** (Mac-only advantage): press `i` in the Expo CLI, or
  `npx expo start --ios`. Needs Xcode installed (Mac App Store — it's a
  large download, do this ahead of time if you want to test iOS). No Apple
  Developer account needed for the Simulator, only for an eventual real
  standalone iOS build.
- **Android**: see §4 below for SDK/emulator setup, then `npx expo start --android` or press `a`.
- **Expo Go on a physical phone**: scan the QR code the CLI prints, same as before.

## 4. Android development on Mac

Different install path than Windows, same end result.

1. Install **Android Studio**: https://developer.android.com/studio
2. On first launch, let it install the Android SDK (default location:
   `~/Library/Android/sdk` — this is the Mac equivalent of Windows'
   `%LOCALAPPDATA%\Android\Sdk`).
3. Add to your shell profile (`~/.zshrc` if using zsh, the macOS default):
   ```bash
   export ANDROID_HOME="$HOME/Library/Android/sdk"
   export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator"
   ```
   Then `source ~/.zshrc` (or open a new terminal tab).
4. **Create an emulator**: Android Studio → Device Manager → Create Device.
   Pick any recent phone profile + a recent API level system image (the
   Windows dev machine used API 34 "Galaxy S24" and "Pixel 6 Pro" profiles
   — matching those isn't required, any modern profile works fine).
5. Verify: `adb devices` should list the emulator once it's running, or
   your phone once connected via USB with **Developer options → USB
   debugging** turned on (Settings → About phone → tap Build number 7
   times to unlock Developer options first, same as on the Windows setup).

Everything from here (`npx expo start --android`, scanning a QR code,
`adb`-driven debugging) works identically to how it worked on Windows —
only the SDK install path and shell profile syntax differ.

## 5. Apps Script tooling (`appscript/`)

The live backend is a Google Apps Script Web App. `clasp` (the CLI) stores
its OAuth login per-machine, so this needs a fresh login here even though
it's the same Google account already authorized on the Windows machine.

```bash
npm install -g @google/clasp
clasp login
cd appscript
clasp push       # pushes local source to the Apps Script project
```

Project details (not secret — an id, not a credential):
- Script ID: `1voSkxu94DSrlpWyfrls7t2-huLfISwRUtG0YWgotWXG1qplK3vI0h-qm`
- Editor: https://script.google.com/home/projects/1voSkxu94DSrlpWyfrls7t2-huLfISwRUtG0YWgotWXG1qplK3vI0h-qm/edit
- Live deployment URL (same one already in the app's Server URL field): https://script.google.com/macros/s/AKfycbzjUaT3ACrqXkRkq9k7ZtHIWnw4AjTy568GEq2vmPAAAFH2bPh2m6RAzHy6T9e7qB6h2w/exec

**Known gotcha, not Windows-specific**: the deployment's "Who has access"
setting reverts away from "Anyone" unreliably — sometimes after
`clasp redeploy`, sometimes with no redeploy at all (confirmed this isn't
fixable from code — Google's own Apps Script REST API has no field for it).
After any redeploy, check with:
```bash
curl -sI "https://script.google.com/macros/s/AKfycbzjUaT3ACrqXkRkq9k7ZtHIWnw4AjTy568GEq2vmPAAAFH2bPh2m6RAzHy6T9e7qB6h2w/exec" | head -5
```
If the `location:` header points at `accounts.google.com`, it reverted —
fix it manually: editor → Deploy → Manage deployments → pencil icon → Who
has access → Anyone → Deploy.

To actually publish a code change to the live URL (`clasp push` alone only
updates the editor copy):
```bash
clasp version "description of the change"
clasp deployments   # find the deployment id
clasp redeploy <deploymentId> -V <versionNumber> -d "description"
```

## 6. EAS (standalone Android build)

```bash
npm install -g eas-cli
eas login
cd app
eas build --platform android --profile preview
```

Same Expo account (`joe.jmcf`), same project (`@joe.jmcf/app`,
`projectId: 4512346f-1e7a-4f17-a7f7-eb1f33415e73`) — `eas.json` and
`app.json` already have this wired up, `eas login` on this machine is the
only new step. The build runs on Expo's servers regardless of which
machine kicks it off.

## 7. What's where

- `app/` — the Expo/React Native app (both phones run this).
- `appscript/` — the live backend (Google Apps Script + Sheets).
- `server/` — the **original** Node/Express/SQLite backend, archived/
  superseded, not run anymore (see `server/README.md`).
- `docs/backend-migration.md` — the plan for the *next* backend (Postgres +
  Express), being scaffolded on `feature/backend-migration`.
- `PRD.md` — the living design doc; read this for full context on where
  the project is headed (shared household budgets, receipt capture, the
  reasoning behind the backend migration).
