// __DEV__-gated one-time demo data seeding — not a real app feature, just
// a convenience for populating a dev/demo household with realistic-
// looking data instead of an empty one. Triggered from HouseholdScreen's
// dev-only "Seed September Demo Data" button. This can't run from a
// backend script: category/transaction content is only ever encrypted
// client-side with the household DEK (§10a), which never leaves the
// device, so seeding has to happen through the app's own live session.
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

// Only the categories where the source spreadsheet's budget row was
// unambiguous once collapsed blank cells were accounted for — Wellness/
// Shopping/Cleaning/Car and a couple of middle rows were left out
// deliberately rather than guessed at (see conversation).
const SEPTEMBER_BUDGETS = {
  "Home Fud": 542,
  "Outside Fud": 330,
  Travel: 485,
  Partying: 230,
  Pets: 200,
  Bills: 0,
  Health: 300,
};

// Only the transactions that were unambiguous in the source data (a
// single amount + description per row, no competing column values).
// "Co-op groceries" entries had no explicit date in the source, so
// they're spread arbitrarily across the month; the "Smith brothers"
// entries use the dates already embedded in their own description.
const SEPTEMBER_TRANSACTIONS = [
  { category: "Home Fud", amount: -127, description: "Co-op groceries", date: "2026-09-02" },
  { category: "Home Fud", amount: -134, description: "Co-op groceries", date: "2026-09-09" },
  { category: "Home Fud", amount: -48, description: "Smith brothers 9/4", date: "2026-09-04" },
  { category: "Home Fud", amount: -54, description: "Smith brothers 9/11", date: "2026-09-11" },
];

export async function seedSeptemberDemoData(householdId) {
  const accounts = await repo.listAccounts(householdId);
  if (accounts.length === 0) {
    throw new Error("Add an account first — there's nothing to attach transactions to yet.");
  }
  const accountId = accounts[0].id;

  const categoryIdByName = {};
  for (const name of SEPTEMBER_CATEGORY_NAMES) {
    const created = await repo.createCategory(householdId, name);
    categoryIdByName[name] = created.id;
  }

  for (const [name, amount] of Object.entries(SEPTEMBER_BUDGETS)) {
    await repo.setBudget(householdId, categoryIdByName[name], SEPTEMBER, amount);
  }

  for (const tx of SEPTEMBER_TRANSACTIONS) {
    await repo.createManualTransaction(householdId, {
      accountId,
      categoryId: categoryIdByName[tx.category],
      amount: tx.amount,
      description: tx.description,
      date: tx.date,
    });
  }

  return {
    categoriesCreated: SEPTEMBER_CATEGORY_NAMES.length,
    budgetsSet: Object.keys(SEPTEMBER_BUDGETS).length,
    transactionsCreated: SEPTEMBER_TRANSACTIONS.length,
    skipped:
      "Wellness/Shopping/Cleaning/Car budgets and two middle spreadsheet rows were left out — their column mapping was ambiguous, not guessed at.",
  };
}
