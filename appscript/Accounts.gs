const ACCOUNT_TYPES = ["credit", "checking", "savings"];

function handleAccountsList_(user) {
  return readAll_("Accounts")
    .filter((a) => a.userId === user.id)
    .map(stripRow_);
}

function handleAccountsCreate_(user, payload) {
  const { name, type, institution } = payload || {};
  if (!name || ACCOUNT_TYPES.indexOf(type) === -1) {
    throw new Error("name and type (credit|checking|savings) are required");
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
  return stripRow_(account);
}

function handleAccountsDelete_(user, payload) {
  const { id } = payload || {};
  const account = readAll_("Accounts").find((a) => a.id === id && a.userId === user.id);
  if (!account) throw new Error("not found");

  deleteRow_("Accounts", account._rowNumber);

  // Mirrors the SQLite schema's ON DELETE CASCADE from accounts to transactions.
  // Delete bottom-up so earlier row numbers stay valid as later rows are removed.
  readAll_("Transactions")
    .filter((t) => t.accountId === id)
    .sort((a, b) => b._rowNumber - a._rowNumber)
    .forEach((t) => deleteRow_("Transactions", t._rowNumber));

  return { ok: true };
}
