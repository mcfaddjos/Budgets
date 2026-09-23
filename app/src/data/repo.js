// Every screen goes through here instead of calling api/client.js directly
// for household data — this is the one place that actually touches the
// household DEK, so encrypt-before-send / decrypt-after-fetch happens
// once, not once per screen. Mirrors what the backend handlers used to do
// server-side (see backend/src/handlers/*.js's comments), now client-side
// per §10a.
import { api } from "../api/client";
import * as records from "../crypto/records";
import * as session from "../crypto/session";
import { normalizeDescription, derivePatternFromDescription } from "../categorize/defaults";

function randomDedupKey() {
  return `manual:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

async function decryptRows(dek, rows, extraFields) {
  return Promise.all(
    rows.map(async (r) => {
      const decrypted = await records.decryptRecord(dek, r.encryptedData, r.nonce);
      const picked = {};
      for (const f of extraFields) picked[f] = r[f];
      return { id: r.id, ...picked, ...decrypted };
    })
  );
}

// ----- Accounts -----

export async function listAccounts(householdId) {
  const dek = session.getHouseholdDek(householdId);
  const raw = await api.getAccounts();
  return decryptRows(dek, raw, ["createdAt", "ownerUserIds"]);
}

export async function createAccount(householdId, { name, type, institution, ownerUserIds }) {
  const dek = session.getHouseholdDek(householdId);
  const { encryptedData, nonce } = await records.encryptRecord(dek, { name, type, institution: institution || null });
  return api.createAccount(encryptedData, nonce, ownerUserIds);
}

export function deleteAccount(id) {
  return api.deleteAccount(id);
}

// ----- Categories -----

export async function listCategories(householdId) {
  const dek = session.getHouseholdDek(householdId);
  const raw = await api.getCategories();
  const rows = await decryptRows(dek, raw, []);
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

/** Duplicate-name checking moved here from the server (§10a) — ciphertext isn't comparable, so it can only happen after decrypting. */
export async function createCategory(householdId, name) {
  const existing = await listCategories(householdId);
  if (existing.some((c) => c.name === name)) throw new Error("category already exists");
  const dek = session.getHouseholdDek(householdId);
  const { encryptedData, nonce } = await records.encryptRecord(dek, { name });
  return api.createCategory(encryptedData, nonce);
}

export async function updateCategory(householdId, id, name) {
  const existing = await listCategories(householdId);
  if (existing.some((c) => c.name === name && c.id !== id)) throw new Error("category already exists");
  const dek = session.getHouseholdDek(householdId);
  const { encryptedData, nonce } = await records.encryptRecord(dek, { name });
  return api.updateCategory(id, encryptedData, nonce);
}

// ----- Category rules -----

export async function listCategoryRules(householdId) {
  const dek = session.getHouseholdDek(householdId);
  const raw = await api.getCategoryRules();
  return decryptRows(dek, raw, ["categoryId"]);
}

/** Replaces the old server-side saveRule() side effect of transactions.update — now a separate call, since it needs the plaintext description the server no longer has. */
export async function saveRuleForDescription(householdId, normalizedDescription, categoryId) {
  const pattern = derivePatternFromDescription(normalizedDescription);
  if (!pattern) return;
  const dek = session.getHouseholdDek(householdId);
  const { encryptedData, nonce } = await records.encryptRecord(dek, { pattern });
  return api.createCategoryRule(categoryId, encryptedData, nonce);
}

// ----- Transactions -----

export async function listTransactions(householdId, params) {
  const dek = session.getHouseholdDek(householdId);
  const raw = await api.getTransactions(params);
  return decryptRows(dek, raw, ["accountId", "categoryId", "date", "reviewed", "createdByUserId", "createdAt"]);
}

/**
 * dedupKey is random here, not the keyed content-hash — manual entries
 * were never deduped against anything (two genuinely separate $5 coffees
 * on the same day are both real, see backend/src/handlers/transactions.js)
 * and that stays true now; the content-hash form is for statement import,
 * not built yet.
 *
 * items/tax/tip (PRD §8.6) are optional — undefined for a plain manual
 * entry, populated when this transaction came from a scanned receipt.
 * Each item is `{ description, amount, categoryId }`; categoryId is
 * schema-ready but unused in v1 (no UI sets it yet). They live inside the
 * same encryptedData blob as everything else — records.encryptRecord is
 * generic, so this needed no changes there.
 */
export async function createManualTransaction(
  householdId,
  { accountId, categoryId, amount, description, fallbackDescription, date, items, tax, tip }
) {
  const dek = session.getHouseholdDek(householdId);
  const finalDescription = (description || "").trim() || fallbackDescription || "";
  const fields = {
    description: finalDescription,
    normalizedDescription: normalizeDescription(finalDescription),
    amount,
  };
  if (items !== undefined) fields.items = items;
  if (tax !== undefined) fields.tax = tax;
  if (tip !== undefined) fields.tip = tip;
  const { encryptedData, nonce } = await records.encryptRecord(dek, fields);
  return api.createTransaction({
    accountId,
    categoryId,
    date: date || new Date().toISOString().slice(0, 10),
    encryptedData,
    nonce,
    dedupKey: randomDedupKey(),
  });
}

export async function recategorizeTransaction(householdId, tx, categoryId, applyRule) {
  if (applyRule) await saveRuleForDescription(householdId, tx.normalizedDescription, categoryId);
  const updated = await api.updateTransaction(tx.id, { categoryId });
  return { ...tx, categoryId: updated.categoryId };
}

export async function toggleReviewed(tx) {
  const updated = await api.updateTransaction(tx.id, { reviewed: !tx.reviewed });
  return { ...tx, reviewed: updated.reviewed };
}

export function deleteTransaction(id) {
  return api.deleteTransaction(id);
}

export async function getTransactionFormOptions(householdId) {
  const dek = session.getHouseholdDek(householdId);
  const raw = await api.getTransactionFormOptions();
  const [accounts, categories] = await Promise.all([
    decryptRows(dek, raw.accounts, []),
    decryptRows(dek, raw.categories, []),
  ]);
  return { accounts, categories: categories.sort((a, b) => a.name.localeCompare(b.name)) };
}

// ----- Budgets -----

/** Totals/variance computation moved here from the server (§10a) — amount is encrypted, so this can only run after decrypting. Same math the old budgets.get handler did server-side. */
export async function getBudgetSummary(householdId, month) {
  const dek = session.getHouseholdDek(householdId);
  const raw = await api.getBudgets(month);

  const [categories, budgets, transactions] = await Promise.all([
    decryptRows(dek, raw.categories, []),
    decryptRows(dek, raw.budgets, ["categoryId"]),
    decryptRows(dek, raw.transactions, ["categoryId"]),
  ]);

  const categoryRows = categories
    .map((c) => {
      const budget = budgets.find((b) => b.categoryId === c.id);
      const budgetAmount = budget ? budget.amount : 0;
      const actual = transactions.filter((t) => t.categoryId === c.id).reduce((sum, t) => sum + t.amount, 0);
      return { categoryId: c.id, categoryName: c.name, budgetAmount, actual, variance: budgetAmount - actual };
    })
    .sort((a, b) => a.categoryName.localeCompare(b.categoryName));

  const totals = categoryRows.reduce(
    (acc, c) => ({ budget: acc.budget + c.budgetAmount, actual: acc.actual + c.actual }),
    { budget: 0, actual: 0 }
  );
  totals.variance = totals.budget - totals.actual;

  return { month: raw.month, categories: categoryRows, totals };
}

export async function setBudget(householdId, categoryId, month, amount) {
  const dek = session.getHouseholdDek(householdId);
  const { encryptedData, nonce } = await records.encryptRecord(dek, { amount });
  return api.setBudget(categoryId, month, encryptedData, nonce);
}

// ----- Household settings -----

/** keepReceiptImages is plaintext (a preference, not financial content) — see backend/prisma/schema.prisma's Household model. */
export function getHouseholdSettings() {
  return api.getHouseholdSettings();
}

export function setKeepReceiptImages(keep) {
  return api.setKeepReceiptImages(keep);
}

// ----- Receipt images -----

/**
 * Same encrypt-before-send shape as every other record (§10a) — the image
 * is just a base64 string living inside the JSON blob alongside mimeType,
 * so records.encryptRecord/decryptRecord needed no changes to support it.
 * Callers should check getHouseholdSettings().keepReceiptImages before
 * calling this — the server has no opinion on whether to keep the image,
 * it just stores whatever ciphertext it's handed.
 */
export async function saveReceiptImage(householdId, transactionId, { image, mimeType }) {
  const dek = session.getHouseholdDek(householdId);
  const { encryptedData, nonce } = await records.encryptRecord(dek, { image, mimeType });
  return api.uploadReceiptImage(transactionId, encryptedData, nonce);
}

/** Returns null if this transaction never had an image saved (or the setting was off when it was created). */
export async function getReceiptImage(householdId, transactionId) {
  const dek = session.getHouseholdDek(householdId);
  const row = await api.getReceiptImage(transactionId);
  if (!row) return null;
  return records.decryptRecord(dek, row.encryptedData, row.nonce);
}
