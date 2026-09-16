const ACCOUNT_TYPES = ["checking", "savings"];

function handleAccountsList_(user) {
  return getUserAccounts_(user.id).map(stripRow_);
}

function handleAccountsCreate_(user, payload) {
  const { name, type, institution } = payload || {};
  if (!name || ACCOUNT_TYPES.indexOf(type) === -1) {
    throw new Error("name and type (checking|savings) are required");
  }

  const account = {
    id: newId_(),
    userId: user.id,
    name,
    type,
    institution: institution || "",
    createdAt: new Date().toISOString(),
  };
  appendRow_("Accounts", account);
  invalidateUserAccounts_(user.id);
  return stripRow_(account);
}

/**
 * Idempotent on purpose: a delete whose response got lost to the redirect
 * flakiness gets retried by the client, and the retry legitimately finds
 * nothing (because the first attempt already deleted it) — that's success,
 * not an error. Treating "already gone" as a failure was exactly what
 * surfaced a successful delete to the user as "couldn't delete account".
 */
function handleAccountsDelete_(user, payload) {
  const { id } = payload || {};
  const account = getUserAccounts_(user.id).find((a) => a.id === id);
  if (!account) return { ok: true };

  deleteRow_("Accounts", account._rowNumber);
  invalidateUserAccounts_(user.id);

  // Mirrors the SQLite schema's ON DELETE CASCADE from accounts to transactions.
  // Delete bottom-up so earlier row numbers stay valid as later rows are removed.
  readAll_("Transactions")
    .filter((t) => t.accountId === id)
    .sort((a, b) => b._rowNumber - a._rowNumber)
    .forEach((t) => deleteRow_("Transactions", t._rowNumber));

  return { ok: true };
}
