// __DEV__-gated one-time demo data seeding — not a real app feature, just
// a convenience for populating a dev/demo household with realistic-
// looking data instead of an empty one. Triggered from HouseholdScreen's
// dev-only "Seed September Demo Data" button. This can't run from a
// backend script: category/transaction content is only ever encrypted
// client-side with the household DEK (§10a), which never leaves the
// device, so seeding has to happen through the app's own live session.
//
// Sourced from the real "Spend Less - Sept 2026.csv" export (an earlier
// attempt to parse a pasted-into-chat version of this same sheet was
// ambiguous — whitespace collapsed several blank cells together — the
// real CSV resolves every cell cleanly). The sheet's structure: row 1 is
// the September budget amount per category; each later row is one or
// more same-row transactions across different categories, with note
// sub-columns paired to specific categories (e.g. "Flowers" paired with
// a Shopping amount) plus one shared note column covering Outside
// Fud-through-Wellness.
import * as repo from "./repo";

const SEPTEMBER = "2026-09";

export const SEPTEMBER_CATEGORY_NAMES = [
  "Home Fud",
  "Outside Fud",
  "Travel",
  "Partying",
  "Pets",
  "Bills",
  "Health",
  "Wellness",
  "Shopping",
  "Cleaning",
  "Car",
];

// Row 1 of the sheet — one amount per category, unambiguous now that the
// real CSV shows every column.
const SEPTEMBER_BUDGETS = {
  "Home Fud": 542,
  "Outside Fud": 330,
  Travel: 485,
  Partying: 230,
  Pets: 200,
  Bills: 0,
  Health: 300,
  Wellness: -1430,
  Shopping: 467,
  Cleaning: -145,
  Car: 205,
};

// Rows without an explicit date (most of them) get an approximate,
// roughly-chronological placeholder date within September — the sheet
// doesn't record one. The two "Smith brothers" entries use the dates
// already embedded in their own descriptions.
const SEPTEMBER_TRANSACTIONS = [
  // Row 2 of the sheet (~week 1)
  { category: "Home Fud", amount: -70, date: "2026-09-03" },
  { category: "Outside Fud", amount: -60, date: "2026-09-03" },
  { category: "Travel", amount: -15, date: "2026-09-03" },
  { category: "Partying", amount: -110, date: "2026-09-03" },
  { category: "Bills", amount: -3300, date: "2026-09-03" },
  { category: "Wellness", amount: -120, date: "2026-09-03" },
  { category: "Shopping", amount: -20, description: "Flowers", date: "2026-09-03" },
  { category: "Cleaning", amount: -105, date: "2026-09-03" },
  { category: "Car", amount: -65, date: "2026-09-03" },

  // Row 3 of the sheet (~week 2)
  { category: "Home Fud", amount: -11, date: "2026-09-10" },
  { category: "Outside Fud", amount: -70, date: "2026-09-10" },
  { category: "Partying", amount: -100, date: "2026-09-10" },
  { category: "Wellness", amount: -840, description: "Gym membership", date: "2026-09-10" },
  { category: "Shopping", amount: -13, description: "Gua sha", date: "2026-09-10" },
  { category: "Cleaning", amount: -240, description: "trees", date: "2026-09-10" },
  { category: "Car", amount: -730, date: "2026-09-10" },

  // Row 4 of the sheet (~week 3)
  { category: "Home Fud", amount: -14, date: "2026-09-17" },
  { category: "Outside Fud", amount: -40, date: "2026-09-17" },
  { category: "Partying", amount: -60, date: "2026-09-17" },
  { category: "Wellness", amount: -840, description: "Gym membership", date: "2026-09-17" },

  // Row 5 of the sheet
  { category: "Home Fud", amount: -127, description: "Co-op groceries", date: "2026-09-06" },
  { category: "Wellness", amount: -30, date: "2026-09-06" },

  // Rows 6-8 of the sheet
  { category: "Home Fud", amount: -134, description: "Co-op groceries", date: "2026-09-20" },
  { category: "Home Fud", amount: -48, description: "Smith brothers 9/4", date: "2026-09-04" },
  { category: "Home Fud", amount: -54, description: "Smith brothers 9/11", date: "2026-09-11" },
];

export async function seedSeptemberDemoData(householdId) {
  const accounts = await repo.listAccounts(householdId);
  if (accounts.length === 0) {
    throw new Error("Add an account first — there's nothing to attach transactions to yet.");
  }
  const accountId = accounts[0].id;

  const existingCategories = await repo.listCategories(householdId);
  const categoryIdByName = {};
  for (const c of existingCategories) categoryIdByName[c.name] = c.id;

  for (const name of SEPTEMBER_CATEGORY_NAMES) {
    if (categoryIdByName[name]) continue; // already seeded, don't duplicate on a re-run
    const created = await repo.createCategory(householdId, name);
    categoryIdByName[name] = created.id;
  }

  for (const [name, amount] of Object.entries(SEPTEMBER_BUDGETS)) {
    // A budget is always a positive allowance — the sheet's own sign
    // convention (some rows negative) doesn't carry over here. setBudget
    // is an upsert (one row per category+month), so re-running this is
    // always safe and just corrects the amount in place.
    await repo.setBudget(householdId, categoryIdByName[name], SEPTEMBER, Math.abs(amount));
  }

  // Unlike categories/budgets, manual transactions have no dedup
  // check (by design — two genuinely separate $5 coffees on the same day
  // are both real, see backend/src/handlers/transactions.js) — so
  // tapping this button twice would silently double every transaction.
  // Guard against that explicitly instead.
  const existingTransactions = await repo.listTransactions(householdId, { month: SEPTEMBER });
  if (existingTransactions.length > 0) {
    return {
      categoriesCreated: SEPTEMBER_CATEGORY_NAMES.length,
      budgetsSet: Object.keys(SEPTEMBER_BUDGETS).length,
      transactionsCreated: 0,
      transactionsSkipped: `${existingTransactions.length} September transactions already exist — not re-seeding to avoid duplicates. Delete them first (long-press each in Transactions) if you want a clean re-seed.`,
    };
  }

  for (const tx of SEPTEMBER_TRANSACTIONS) {
    await repo.createManualTransaction(householdId, {
      accountId,
      categoryId: categoryIdByName[tx.category],
      amount: tx.amount,
      description: tx.description,
      fallbackDescription: tx.category,
      date: tx.date,
    });
  }

  return {
    categoriesCreated: SEPTEMBER_CATEGORY_NAMES.length,
    budgetsSet: Object.keys(SEPTEMBER_BUDGETS).length,
    transactionsCreated: SEPTEMBER_TRANSACTIONS.length,
  };
}
