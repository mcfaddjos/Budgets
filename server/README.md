# server/ — superseded

This is the original Node/Express/SQLite backend from the PoC's first
session. It's been replaced by the Google Apps Script + Sheets backend in
`../appscript/` (see the top-level `README.md`) so the app can run without a
computer staying on and reachable on the same Wi-Fi as both phones.

Kept here for reference/rollback, not run anymore. `server/data/budgets.sqlite`
only ever had disposable smoketest data — nothing was migrated out of it.
